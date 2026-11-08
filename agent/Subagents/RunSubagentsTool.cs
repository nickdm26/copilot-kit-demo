using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using AGUI.Abstractions;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;
using PtCoach.Agent.Seed;
using PtCoach.Agent.State;

namespace PtCoach.Agent.Subagents;

/// <summary>
/// runSubagents, the coach's delegation tool (CONTRACTS section 11). Only offered on runs with the toggle on
/// (<see cref="SubagentStreamAgent"/>). Applies clientId/goal/daysPerWeek, starts one sub-agent per task, runs them all
/// at once, and returns their reports. Everything they do streams to the browser as it happens:
/// SUBAGENT_STARTED, then attributed TEXT_MESSAGE_* / TOOL_CALL_* / STATE_SNAPSHOT, then SUBAGENT_FINISHED or SUBAGENT_ERROR,
/// each tied to this call by <c>parentToolCallId</c>.
/// </summary>
public sealed class RunSubagentsTool(SubagentHub hub, SubagentRunner runner, SeedStore seed, ProgramStateStore programs, ILogger<RunSubagentsTool> logger)
    : AIFunction
{
    public static readonly ActivitySource Activity = new("PtCoach.Agent.Subagents");

    private static readonly JsonSerializerOptions Strict = ContractJson.Options;

    // Mirrors RunSubagentsArgsSchema in web/src/lib/contracts.ts.
    private static readonly JsonElement Schema = JsonDocument.Parse($$"""
        {
          "type": "object",
          "properties": {
            "clientId": { "type": "string", "description": "Client id, e.g. \"sarah\". Set it on the first call." },
            "goal": { "type": "string", "enum": ["strength", "hypertrophy", "general", "endurance-support"] },
            "daysPerWeek": { "type": "integer", "minimum": 1, "maximum": 6 },
            "tasks": {
              "type": "array",
              "minItems": 1,
              "maxItems": {{SubagentLimits.MaxTasks}},
              "description": "One sub-agent per task; they all run at the same time.",
              "items": {
                "type": "object",
                "properties": {
                  "kind": { "type": "string", "enum": ["build-day", "build-week", "injury-screen"],
                    "description": "build-day writes one day (needs week, day, focus). build-week writes one later week from week 1 (needs week >= 2). injury-screen only reads." },
                  "brief": { "type": "string", "maxLength": {{SubagentLimits.MaxBriefLength}}, "description": "One or two sentences: what this sub-agent should do." },
                  "week": { "type": "integer", "minimum": 1, "maximum": 12 },
                  "day": { "type": "string", "enum": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
                  "focus": { "type": "string", "maxLength": 40, "description": "build-day only, e.g. \"Lower\", \"Upper\", \"Full body\"" }
                },
                "required": ["kind", "brief"],
                "additionalProperties": false
              }
            }
          },
          "required": ["tasks"],
          "additionalProperties": false
        }
        """).RootElement.Clone();

    public override string Name => ToolNames.RunSubagents;

    public override string Description =>
        "Run sub-agents in parallel. Each build-day or build-week sub-agent searches the exercise library and writes its own " +
        "day or week to the grid while the trainer watches; injury-screen lists risky lifts with safer alternatives. " +
        "Returns one report per task, with riskyLifts for the days written.";

    public override JsonElement JsonSchema => Schema;

    public override JsonSerializerOptions JsonSerializerOptions => Strict;

    protected override async ValueTask<object?> InvokeCoreAsync(AIFunctionArguments arguments, CancellationToken cancellationToken)
    {
        var context = FunctionInvokingChatClient.CurrentContext;
        if (hub.ForRun(context?.Options) is not { } run)
        {
            return $"Error: {ToolNames.RunSubagents} is only available while the trainer has parallel sub-agents switched on. Build the program with {ToolNames.UpdateProgram}.";
        }

        RunSubagentsArgs args;
        try
        {
            args = Parse(arguments);
        }
        catch (JsonException ex)
        {
            return $"Error: invalid arguments: {ex.Message} Nothing was started.";
        }

        // Set the client, goal and days first, so the builders write into the right program.
        Client? client;
        lock (run.Program.Gate)
        {
            var start = ProgramUpdater.Apply(run.Program.State, new UpdateProgramArgs(args.ClientId, args.Goal, args.DaysPerWeek));
            client = seed.FindClient(start.ClientId);
            if (client is null) return "Error: set clientId (e.g. \"sarah\") in this call. Nothing was started.";
            if (Problem(args.Tasks, start) is { } problem) return $"Error: {problem} Nothing was started.";

            // New days start as empty columns, in weekday order. Section 1a appends new days, so without this the
            // columns would line up in whatever order the parallel builders happen to finish. Existing days are kept.
            var placeholders = args.Tasks
                .Where(t => t.Kind == SubagentKind.BuildDay &&
                            !start.Weeks.Any(w => w.Number == t.Week && w.Days.Any(d => d.Name == t.Day)))
                .OrderBy(t => t.Week).ThenBy(t => t.Day)
                .Select(t => new ProgramDayUpsert(t.Week!.Value, t.Day!.Value, t.Focus!, []))
                .ToList();
            var next = ProgramUpdater.Apply(start, new UpdateProgramArgs(Days: placeholders));
            if (placeholders.Count > 0 || args.ClientId is not null || args.Goal is not null || args.DaysPerWeek is not null)
            {
                var errors = ProgramStateValidator.Validate(next, programs.ExerciseIds, programs.ClientIds);
                if (errors.Count > 0) return $"Error: {string.Join("; ", errors.Take(5))}. Nothing was started.";
                run.Program.State = next;
                run.Emit(new StateSnapshotEvent { Snapshot = JsonSerializer.SerializeToElement(next, ContractJson.Options) });
            }
        }

        var parentToolCallId = context?.CallContent.CallId;
        var jobs = args.Tasks.Select(t => Job(t)).ToList();
        using var activity = Activity.StartActivity("run_subagents");
        activity?.SetTag("subagents.count", jobs.Count);
        foreach (var job in jobs)
        {
            run.Emit(new SubagentStartedEvent
            {
                SubagentRunId = job.SubagentRunId,
                Name = job.Name,
                Description = job.Title,
                ParentToolCallId = parentToolCallId,
            });
        }
        logger.LogInformation("Run {RunId}: starting {Count} sub-agents ({Titles}).", run.Input.RunId, jobs.Count, string.Join(", ", jobs.Select(j => j.Title)));

        var reports = await Task.WhenAll(jobs.Select(job => runner.RunAsync(run, job, client, cancellationToken)));

        ProgramState final;
        lock (run.Program.Gate) final = run.Program.State;
        var risky = reports.SelectMany(r => r.RiskyLifts ?? []).Distinct().ToList();
        var result = new JsonObject
        {
            ["reports"] = JsonSerializer.SerializeToNode(reports, ContractJson.Options),
            ["riskyLifts"] = JsonSerializer.SerializeToNode(risky, ContractJson.Options),
            ["next"] = Next(reports, risky),
            ["program"] = JsonSerializer.SerializeToNode(final, ContractJson.Options),
        };
        return JsonSerializer.SerializeToElement(result);
    }

    private static string Next(SubagentReport[] reports, List<string> risky)
    {
        var parts = new List<string> { "The days above are already in the grid; do not write them again." };
        if (reports.Any(r => r.Status == SubagentStatus.Error))
        {
            parts.Add($"Some sub-agents failed: write their days yourself with {ToolNames.UpdateProgram}.");
        }
        if (risky.Count > 0)
        {
            parts.Add($"Flag {string.Join(", ", risky)} with {ToolNames.UpdateProgram} (flags only) and call {ToolNames.ProposeSwap} for each (rule 4).");
        }
        return string.Join(" ", parts);
    }

    private static SubagentJob Job(SubagentTask t)
    {
        var id = $"sa-{Guid.NewGuid():N}"[..15];
        return t.Kind switch
        {
            SubagentKind.BuildDay => new(id, t, "day-builder", $"Week {t.Week} · {t.Day} · {t.Focus}", $"build-day:{t.Week}:{t.Day}"),
            SubagentKind.BuildWeek => new(id, t, "week-builder", $"Week {t.Week}", $"build-week:{t.Week}"),
            _ => new(id, t, "injury-screen", "Injury screen", "injury-screen"),
        };
    }

    /// <summary>What is wrong with this set of tasks, or null. The model gets it back to fix.</summary>
    public static string? Problem(IReadOnlyList<SubagentTask> tasks, ProgramState program)
    {
        if (tasks.Count is 0 or > SubagentLimits.MaxTasks) return $"send 1 to {SubagentLimits.MaxTasks} tasks.";
        var scopes = new HashSet<string>();
        foreach (var t in tasks)
        {
            if (string.IsNullOrWhiteSpace(t.Brief)) return "every task needs a brief.";
            if (t.Brief.Length > SubagentLimits.MaxBriefLength) return $"briefs are at most {SubagentLimits.MaxBriefLength} characters.";
            switch (t.Kind)
            {
                case SubagentKind.BuildDay:
                    if (t.Week is null || t.Day is null || string.IsNullOrWhiteSpace(t.Focus)) return "build-day tasks need week, day and focus.";
                    if (t.Focus.Length > 40) return "focus is at most 40 characters.";
                    if (!scopes.Add($"{t.Week}:{t.Day}")) return $"two tasks build week {t.Week} {t.Day}.";
                    break;
                case SubagentKind.BuildWeek:
                    if (t.Week is not (>= 2 and <= 12)) return "build-week tasks need a week from 2 to 12.";
                    if (!scopes.Add($"{t.Week}")) return $"two tasks build week {t.Week}.";
                    if (!program.Weeks.Any(w => w.Number == 1 && w.Days.Count > 0))
                    {
                        return "build-week works from week 1, which is not in the grid yet. Build week 1 first (build-day tasks), then call again for the later weeks.";
                    }
                    break;
                case SubagentKind.InjuryScreen:
                    if (!scopes.Add("injury-screen")) return "send at most one injury-screen task.";
                    break;
            }
        }
        // A build-day task and a build-week task for the same week would write the same days.
        var dayWeeks = tasks.Where(t => t.Kind == SubagentKind.BuildDay).Select(t => t.Week).ToHashSet();
        if (tasks.Any(t => t.Kind == SubagentKind.BuildWeek && dayWeeks.Contains(t.Week))) return "a week is built by build-day and build-week tasks at once.";
        return null;
    }

    /// <summary>Strict parse with the contract options. Some models send the tasks array as a JSON string; accept that.</summary>
    public static RunSubagentsArgs Parse(AIFunctionArguments arguments)
    {
        var obj = new JsonObject();
        foreach (var (key, value) in arguments)
        {
            var node = value switch
            {
                null => null,
                JsonElement e => JsonNode.Parse(e.GetRawText()),
                JsonNode n => n.DeepClone(),
                _ => JsonSerializer.SerializeToNode(value, value.GetType()),
            };
            if (key == "tasks" && node is JsonValue v && v.TryGetValue<string>(out var text))
            {
                try { node = JsonNode.Parse(text); }
                catch (JsonException) { /* deserialization reports it */ }
            }
            obj[key] = node;
        }
        return obj.Deserialize<RunSubagentsArgs>(Strict) ?? throw new JsonException("missing arguments.");
    }
}

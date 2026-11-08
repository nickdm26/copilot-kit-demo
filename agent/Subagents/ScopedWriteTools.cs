using System.Text.Json;
using System.Text.Json.Nodes;
using AGUI.Abstractions;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;
using PtCoach.Agent.State;

namespace PtCoach.Agent.Subagents;

/// <summary>
/// A sub-agent's only way to write the grid: writeDay (one fixed (week, day)) or writeWeek (one fixed week). Both turn
/// the call into an updateProgram call on the run's shared working copy, so validation and section 1a semantics are
/// exactly updateProgram's, and each success goes to the browser as a STATE_SNAPSHOT attributed to the sub-agent.
/// The scope is fixed by the tool, not by the model: parallel builders can never overwrite each other's days.
/// </summary>
public sealed class ScopedWriteTool : AIFunction
{
    private readonly SubagentRun run;
    private readonly UpdateProgramTool updateProgram;
    private readonly string subagentRunId;
    private readonly int week;
    private readonly WeekDay? day;

    private ScopedWriteTool(SubagentRun run, UpdateProgramTool updateProgram, string subagentRunId, int week, WeekDay? day,
        string name, string description, JsonElement schema)
    {
        this.run = run;
        this.updateProgram = updateProgram;
        this.subagentRunId = subagentRunId;
        this.week = week;
        this.day = day;
        Name = name;
        Description = description;
        JsonSchema = schema;
    }

    /// <summary>Exercise ids this tool has written so far, in order (for the sub-agent's report).</summary>
    public List<string> Written { get; } = [];

    public override string Name { get; }

    public override string Description { get; }

    public override JsonElement JsonSchema { get; }

    public static ScopedWriteTool ForDay(SubagentRun run, UpdateProgramTool updateProgram, string subagentRunId, int week, WeekDay day) =>
        new(run, updateProgram, subagentRunId, week, day, ToolNames.WriteDay,
            $"Write your day (week {week}, {day}) to the program grid. Replaces the whole day. Returns 'ok' or an error to fix.",
            Schema(new JsonObject
            {
                ["focus"] = new JsonObject { ["type"] = "string", ["maxLength"] = 40, ["description"] = "e.g. \"Lower\", \"Upper\", \"Full body\"" },
                ["exercises"] = JsonNode.Parse(UpdateProgramTool.ExercisesSchema.GetRawText()),
            }, "focus", "exercises"));

    public static ScopedWriteTool ForWeek(SubagentRun run, UpdateProgramTool updateProgram, string subagentRunId, int week) =>
        new(run, updateProgram, subagentRunId, week, null, ToolNames.WriteWeek,
            $"Write your week (week {week}) to the program grid, all of its days in one call. Returns 'ok' or an error to fix.",
            Schema(new JsonObject
            {
                ["days"] = new JsonObject
                {
                    ["type"] = "array",
                    ["minItems"] = 1,
                    ["maxItems"] = 7,
                    ["items"] = new JsonObject
                    {
                        ["type"] = "object",
                        ["properties"] = new JsonObject
                        {
                            ["day"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun") },
                            ["focus"] = new JsonObject { ["type"] = "string", ["maxLength"] = 40 },
                            ["exercises"] = JsonNode.Parse(UpdateProgramTool.ExercisesSchema.GetRawText()),
                        },
                        ["required"] = new JsonArray("day", "focus", "exercises"),
                        ["additionalProperties"] = false,
                    },
                },
            }, "days"));

    private static JsonElement Schema(JsonObject properties, params string[] required) =>
        JsonSerializer.SerializeToElement(new JsonObject
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = new JsonArray([.. required.Select(r => (JsonNode)r)]),
            ["additionalProperties"] = false,
        });

    protected override ValueTask<object?> InvokeCoreAsync(AIFunctionArguments arguments, CancellationToken cancellationToken)
    {
        JsonArray days;
        try
        {
            days = day is { } d
                ? [new JsonObject { ["week"] = week, ["day"] = Wire(d), ["focus"] = Node(arguments, "focus"), ["exercises"] = Node(arguments, "exercises") }]
                : WeekDays(Node(arguments, "days"));
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            return ValueTask.FromResult<object?>($"{UpdateProgramTool.ErrorPrefix} invalid arguments: {ex.Message} Nothing was changed.");
        }

        var call = new AIFunctionArguments { ["days"] = days };
        lock (run.Program.Gate)
        {
            var result = updateProgram.Invoke(run.Program, call);
            if (result is not JsonElement state) return ValueTask.FromResult<object?>(result);

            // Inside the lock, so the snapshots reach the browser in the same order the writes were applied.
            run.Emit(new StateSnapshotEvent { SubagentRunId = subagentRunId, Snapshot = state });
            Written.Clear();
            foreach (var item in days)
            {
                foreach (var e in item!["exercises"]!.AsArray()) Written.Add(e!["exerciseId"]!.GetValue<string>());
            }
            return ValueTask.FromResult<object?>($"ok: wrote {Written.Count} exercises. The trainer sees them in the grid now.");
        }
    }

    private JsonArray WeekDays(JsonNode? days)
    {
        if (days is not JsonArray list) throw new InvalidOperationException("'days' must be an array.");
        var outList = new JsonArray();
        foreach (var item in list)
        {
            if (item is not JsonObject o) throw new InvalidOperationException("each day must be an object.");
            var copy = (JsonObject)o.DeepClone();
            copy["week"] = week; // the week is the tool's, never the model's
            outList.Add(copy);
        }
        return outList;
    }

    /// <summary>The argument as a JSON node. Some models send nested arrays as a JSON string; accept that.</summary>
    private static JsonNode? Node(AIFunctionArguments arguments, string key)
    {
        if (!arguments.TryGetValue(key, out var value) || value is null) return null;
        var node = value switch
        {
            JsonElement e => JsonNode.Parse(e.GetRawText()),
            JsonNode n => n.DeepClone(),
            _ => JsonSerializer.SerializeToNode(value, value.GetType()),
        };
        if (node is JsonValue v && v.TryGetValue<string>(out var text) && text.TrimStart().StartsWith('['))
        {
            node = JsonNode.Parse(text);
        }
        return node;
    }

    private static string Wire(WeekDay d) => JsonSerializer.Serialize(d, ContractJson.Options).Trim('"');
}

using System.Diagnostics;
using System.Text.Json;
using AGUI.Abstractions;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using PtCoach.Agent.Agents;
using PtCoach.Agent.Chat;
using PtCoach.Agent.Models;
using PtCoach.Agent.Seed;
using PtCoach.Agent.State;
using PtCoach.Agent.Telemetry;
using PtCoach.Agent.Tools;

namespace PtCoach.Agent.Subagents;

/// <summary>One task, ready to run: what it is, its ids and its prompt.</summary>
public sealed record SubagentJob(string SubagentRunId, SubagentTask Task, string Name, string Title, string ReplayKey);

/// <summary>
/// Runs one sub-agent: a small ChatClientAgent on the coach's own model with its own prompt and tools, and translates
/// its stream into AG-UI events attributed to its <c>subagentRunId</c> (CONTRACTS section 11):
/// TEXT_MESSAGE_* for its brief and its words, TOOL_CALL_* and TOOL_CALL_RESULT for its tool calls,
/// STATE_SNAPSHOT for each write (from <see cref="ScopedWriteTool"/>). The caller sends SUBAGENT_STARTED/FINISHED.
/// </summary>
public sealed class SubagentRunner(
    IChatClient chat,
    CoachTools coachTools,
    SeedStore seed,
    UpdateProgramTool updateProgram,
    ILoggerFactory loggerFactory,
    IOptions<TelemetryOptions> telemetry)
{
    /// <summary>Tool results are trimmed to this many characters on the wire (the sub-agent itself sees all of it).</summary>
    public const int MaxResultChars = 2000;

    private readonly ILogger logger = loggerFactory.CreateLogger<SubagentRunner>();

    public async Task<SubagentReport> RunAsync(SubagentRun run, SubagentJob job, Client client, CancellationToken cancellationToken)
    {
        var started = Stopwatch.StartNew();
        var id = job.SubagentRunId;
        var task = job.Task;
        ScopedWriteTool? writer = task.Kind switch
        {
            SubagentKind.BuildDay => ScopedWriteTool.ForDay(run, updateProgram, id, task.Week!.Value, task.Day!.Value),
            SubagentKind.BuildWeek => ScopedWriteTool.ForWeek(run, updateProgram, id, task.Week!.Value),
            _ => null,
        };
        var search = coachTools.CreateAll().First(t => t.Name == ToolNames.SearchExercises);
        List<AITool> tools = writer is null ? [search] : [search, writer];

        ProgramState program;
        lock (run.Program.Gate) program = run.Program.State;

        var options = new ChatOptions
        {
            Instructions = SubagentPrompts.For(task, client, program),
            Tools = tools,
            AdditionalProperties = new() { [ReplayJson.SubagentKey] = $"{run.Input.ThreadId}|{job.ReplayKey}" },
        };
        AIAgent agent = chat.AsAIAgent(
            new ChatClientAgentOptions { Name = $"subagent-{job.Name}", Description = job.Title, ChatOptions = options },
            loggerFactory: loggerFactory);
        agent = agent.AsBuilder()
            .UseOpenTelemetry(CoachAgentBuilder.AgentTelemetrySource, c => c.EnableSensitiveData = telemetry.Value.CaptureContent)
            .Build();

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(SubagentLimits.Timeout);
        var events = new EventTranslator(run, id);
        events.UserMessage(task.Brief);

        string text;
        try
        {
            await foreach (var update in agent.RunStreamingAsync(
                [new ChatMessage(ChatRole.User, task.Brief)],
                options: new ChatClientAgentRunOptions(new ChatOptions { AdditionalProperties = options.AdditionalProperties }),
                cancellationToken: timeout.Token))
            {
                events.Translate(update);
            }
            text = events.Finish();
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            events.Finish();
            var message = ex is OperationCanceledException
                ? $"Timed out after {SubagentLimits.Timeout.TotalSeconds:0}s."
                : "The sub-agent's model call failed.";
            logger.LogWarning(ex, "Sub-agent {SubagentRunId} ({Title}) failed.", id, job.Title);
            run.Emit(new SubagentErrorEvent { SubagentRunId = id, Message = message, Code = ex is OperationCanceledException ? "timeout" : "model_error" });
            return Report(job, SubagentStatus.Error, message, writer, client, started, events);
        }

        // A builder that never managed to write its day did not do its job, however polite its last words.
        if (writer is { Written.Count: 0 })
        {
            var message = $"Finished without writing {(task.Kind == SubagentKind.BuildDay ? "its day" : "its week")}.";
            run.Emit(new SubagentErrorEvent { SubagentRunId = id, Message = message, Code = "no_write" });
            return Report(job, SubagentStatus.Error, message, writer, client, started, events);
        }

        var report = Report(job, SubagentStatus.Done, string.IsNullOrWhiteSpace(text) ? "Done." : text.Trim(), writer, client, started, events);
        run.Emit(new SubagentFinishedEvent
        {
            SubagentRunId = id,
            Result = JsonSerializer.SerializeToElement(report, ContractJson.Options),
        });
        return report;
    }

    private SubagentReport Report(SubagentJob job, string status, string summary, ScopedWriteTool? writer, Client client,
        Stopwatch started, EventTranslator events) =>
        new(job.SubagentRunId, job.Task.Kind, job.Title, status, Truncate(summary, 600),
            Week: job.Task.Week,
            Day: job.Task.Day,
            Wrote: writer?.Written.ToList(),
            RiskyLifts: writer is null ? null : RiskyLifts(writer.Written, client),
            DurationMs: started.ElapsedMilliseconds,
            InputTokens: events.InputTokens,
            OutputTokens: events.OutputTokens);

    /// <summary>Rule 4: a "high" shoulderStress lift is risky for a client with a shoulder injury. Decided here, not by the model.</summary>
    private List<string> RiskyLifts(IEnumerable<string> written, Client client)
    {
        if (!client.Injuries.Any(i => i.Area == InjuryArea.Shoulder)) return [];
        var high = seed.Exercises.Where(e => e.ShoulderStress == ShoulderStress.High).Select(e => e.Id).ToHashSet();
        return written.Where(high.Contains).Distinct().ToList();
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max] + "...";

    /// <summary>Turns one sub-agent's MAF updates into attributed AG-UI events, keeping message and call ids unique per run.</summary>
    private sealed class EventTranslator(SubagentRun run, string subagentRunId)
    {
        private readonly System.Text.StringBuilder lastText = new();
        private string? updateMessageId;
        private string? currentMessage;
        private string? openText;
        private int messages;
        private int results;

        public long? InputTokens { get; private set; }
        public long? OutputTokens { get; private set; }

        public void UserMessage(string brief)
        {
            var id = $"{subagentRunId}-brief";
            run.Emit(new TextMessageStartEvent { SubagentRunId = subagentRunId, MessageId = id, Role = "user" });
            run.Emit(new TextMessageContentEvent { SubagentRunId = subagentRunId, MessageId = id, Delta = brief });
            run.Emit(new TextMessageEndEvent { SubagentRunId = subagentRunId, MessageId = id });
        }

        public void Translate(AgentResponseUpdate update)
        {
            if (update.Role == ChatRole.Assistant && (currentMessage is null || update.MessageId != updateMessageId))
            {
                CloseText();
                updateMessageId = update.MessageId;
                currentMessage = $"{subagentRunId}-m{++messages}";
                lastText.Clear();
            }

            foreach (var content in update.Contents)
            {
                switch (content)
                {
                    case TextContent { Text: { Length: > 0 } delta } when update.Role != ChatRole.Tool:
                        if (openText is null)
                        {
                            openText = currentMessage ??= $"{subagentRunId}-m{++messages}";
                            run.Emit(new TextMessageStartEvent { SubagentRunId = subagentRunId, MessageId = openText, Role = "assistant" });
                        }
                        lastText.Append(delta);
                        run.Emit(new TextMessageContentEvent { SubagentRunId = subagentRunId, MessageId = openText, Delta = delta });
                        break;

                    case FunctionCallContent call:
                        CloseText();
                        var callId = CallId(call.CallId);
                        run.Emit(new ToolCallStartEvent
                        {
                            SubagentRunId = subagentRunId,
                            ToolCallId = callId,
                            ToolCallName = call.Name,
                            ParentMessageId = currentMessage ??= $"{subagentRunId}-m{++messages}",
                        });
                        run.Emit(new ToolCallArgsEvent
                        {
                            SubagentRunId = subagentRunId,
                            ToolCallId = callId,
                            Delta = JsonSerializer.Serialize(call.Arguments ?? new Dictionary<string, object?>(), ContractJson.Options),
                        });
                        run.Emit(new ToolCallEndEvent { SubagentRunId = subagentRunId, ToolCallId = callId });
                        break;

                    case FunctionResultContent result:
                        CloseText();
                        run.Emit(new ToolCallResultEvent
                        {
                            SubagentRunId = subagentRunId,
                            MessageId = $"{subagentRunId}-r{++results}",
                            ToolCallId = CallId(result.CallId),
                            Content = new AGUIContent(Truncate(ResultText(result.Result), MaxResultChars)),
                            Role = "tool",
                        });
                        break;

                    case UsageContent usage:
                        InputTokens = (InputTokens ?? 0) + (usage.Details.InputTokenCount ?? 0);
                        OutputTokens = (OutputTokens ?? 0) + (usage.Details.OutputTokenCount ?? 0);
                        break;
                }
            }
        }

        /// <summary>Closes any open text message and returns the sub-agent's last words.</summary>
        public string Finish()
        {
            CloseText();
            return lastText.ToString();
        }

        private void CloseText()
        {
            if (openText is null) return;
            run.Emit(new TextMessageEndEvent { SubagentRunId = subagentRunId, MessageId = openText });
            openText = null;
        }

        // Model call ids are only unique per response (some providers number them call_0, call_1...).
        private string CallId(string callId) => $"{subagentRunId}-{callId}";

        private static string ResultText(object? result) => result switch
        {
            null => "",
            string s => s,
            JsonElement e => e.GetRawText(),
            _ => JsonSerializer.Serialize(result, ContractJson.Options),
        };
    }
}

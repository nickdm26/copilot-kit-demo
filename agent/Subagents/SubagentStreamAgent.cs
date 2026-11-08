using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Channels;
using AGUI.Abstractions;
using AGUI.Server;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;
using PtCoach.Agent.State;

namespace PtCoach.Agent.Subagents;

/// <summary>
/// The outermost wrapper of every coach agent (CONTRACTS section 11). On a run where the trainer switched the
/// "Parallel sub-agents" toggle on, it:
/// <list type="number">
/// <item>adds the runSubagents tool to that run only (MAF unions run-level tools with the agent's own),</item>
/// <item>tells the coach how to use it (a system message next to the latest request), and</item>
/// <item>merges a per-run event channel into the stream, so the sub-agents' AG-UI events reach the browser while the
/// coach's runSubagents call is still running. A backend tool can't yield updates itself: the function-invoking loop
/// only yields again once the call returns.</item>
/// </list>
/// With the toggle off the run passes straight through, exactly as before.
/// </summary>
public sealed class SubagentStreamAgent(AIAgent innerAgent, AITool runSubagents, SubagentHub hub, ProgramStateStore programs)
    : DelegatingAIAgent(innerAgent)
{
    public const string InstructionsPrefix = "Parallel sub-agents are ON.";

    public static readonly string Instructions = $"""
        {InstructionsPrefix} The trainer switched them on to watch the work run in parallel. While they are on, these rules replace rule 3 for building a program:
        - Build week 1 with ONE {ToolNames.RunSubagents} call: one "build-day" task per training day (week 1, the day, its focus), plus one "injury-screen" task when the client has an injury. Put clientId, goal and daysPerWeek in that call. Call {ToolNames.GetClient} first.
        - The sub-agents write their own days to the grid. Never write those days again with {ToolNames.UpdateProgram}.
        - The result lists riskyLifts. For each one, follow rule 4: add it to flags with {ToolNames.UpdateProgram} (flags only, no days) and call {ToolNames.ProposeSwap}; use the injury screen's alternative.
        - Once every swap is answered and written (rule 5), build every later week with ONE more {ToolNames.RunSubagents} call: one "build-week" task per week (week 2 and up). The week-builders copy week 1 as it is in the grid then, so never put this call in the same turn as a swap's {ToolNames.UpdateProgram}. Say in each brief how that week progresses (e.g. "+1 set on main lifts", "deload: -40% volume").
        - Then call {ToolNames.ShowWeekSummary} for week 1. Keep briefs to one or two sentences.
        Use {ToolNames.RunSubagents} only to build new days and weeks. Everything else (edits, swaps, cards) works as usual.
        """;

    protected override Task<AgentResponse> RunCoreAsync(
        IEnumerable<ChatMessage> messages,
        AgentSession? session = null,
        AgentRunOptions? options = null,
        CancellationToken cancellationToken = default) =>
        RunCoreStreamingAsync(messages, session, options, cancellationToken).ToAgentResponseAsync(cancellationToken);

    protected override IAsyncEnumerable<AgentResponseUpdate> RunCoreStreamingAsync(
        IEnumerable<ChatMessage> messages,
        AgentSession? session = null,
        AgentRunOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        if (options is not ChatClientAgentRunOptions { ChatOptions: { } chatOptions } ||
            !chatOptions.TryGetRunAgentInput(out var input) || input is null || !IsEnabled(input))
        {
            return InnerAgent.RunStreamingAsync(messages, session, options, cancellationToken);
        }

        chatOptions.Tools = [.. chatOptions.Tools ?? [], runSubagents];
        var channel = Channel.CreateUnbounded<AgentResponseUpdate>(new UnboundedChannelOptions { SingleReader = true });
        hub.Register(new SubagentRun(input, programs.ForRun(input), channel.Writer));
        return Merge(WithInstructions(messages), session, options, channel, cancellationToken);
    }

    /// <summary>True when the run's AG-UI context carries the toggle switched on (<c>{"enabled":true}</c>).</summary>
    public static bool IsEnabled(RunAgentInput input)
    {
        var entry = input.Context?.LastOrDefault(c => c.Description == SubagentContext.Description);
        if (entry?.Value is not { Length: > 0 } value) return false;
        try
        {
            using var doc = JsonDocument.Parse(value);
            return doc.RootElement.ValueKind == JsonValueKind.Object &&
                   doc.RootElement.TryGetProperty("enabled", out var enabled) &&
                   enabled.ValueKind == JsonValueKind.True;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>Inserts the sub-agent rules just before the latest user message, where they outweigh rule 3.</summary>
    public static List<ChatMessage> WithInstructions(IEnumerable<ChatMessage> messages)
    {
        var list = messages.ToList();
        var lastUser = list.FindLastIndex(m => m.Role == ChatRole.User);
        list.Insert(lastUser < 0 ? list.Count : lastUser, new ChatMessage(ChatRole.System, Instructions));
        return list;
    }

    private async IAsyncEnumerable<AgentResponseUpdate> Merge(
        IEnumerable<ChatMessage> messages,
        AgentSession? session,
        AgentRunOptions? options,
        Channel<AgentResponseUpdate> channel,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        // The coach's own stream is pumped into the same channel the sub-agents write to. The pump runs the inner
        // agent, so its async-locals (the tool-call context, the current span) flow into runSubagents as usual.
        var pump = Task.Run(async () =>
        {
            try
            {
                await foreach (var update in InnerAgent.RunStreamingAsync(messages, session, options, cancellationToken))
                {
                    await channel.Writer.WriteAsync(update, cancellationToken);
                }
                channel.Writer.TryComplete();
            }
            catch (Exception ex)
            {
                channel.Writer.TryComplete(ex);
            }
        }, cancellationToken);

        await foreach (var update in channel.Reader.ReadAllAsync(cancellationToken))
        {
            yield return update;
        }
        await pump; // surfaces nothing new (errors already completed the channel), but never leaves the task unobserved
    }
}

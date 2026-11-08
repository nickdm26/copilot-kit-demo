using System.Runtime.CompilerServices;
using System.Threading.Channels;
using AGUI.Abstractions;
using AGUI.Server;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using PtCoach.Agent.State;

namespace PtCoach.Agent.Subagents;

/// <summary>
/// A finished AG-UI event riding in the agent's update stream. <c>AGUIStreamOptions.MapContent</c> (see
/// <see cref="SubagentExtension"/>) emits it as is, so sub-agents can put SUBAGENT_* and subagent-attributed events
/// on the wire while the coach's runSubagents call is still running.
/// </summary>
public sealed class AguiEventContent(BaseEvent evt) : AIContent
{
    /// <summary>Type discriminator, registered on the host's JSON options (the host serializes each update into rawEvent).</summary>
    public const string TypeDiscriminator = "ptcoachAguiEvent";

    /// <summary>Not serialized: it is already the event on the wire, so rawEvent only needs the type and name.</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public BaseEvent Event { get; } = evt;

    public string EventType => Event.Type;
}

/// <summary>Sub-agent plumbing for one AG-UI run (the toggle was on).</summary>
public sealed class SubagentRun(RunAgentInput input, ProgramWorkingCopy copy, ChannelWriter<AgentResponseUpdate> events)
{
    public RunAgentInput Input { get; } = input;

    /// <summary>The run's program, shared with updateProgram (same instance as <see cref="ProgramStateStore.ForRun(RunAgentInput)"/>).</summary>
    public ProgramWorkingCopy Program { get; } = copy;

    /// <summary>Puts one AG-UI event on the wire, interleaved with the coach's own stream. Safe from any thread.</summary>
    public void Emit(BaseEvent evt)
    {
        evt.Timestamp ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        // Unbounded channel: TryWrite only fails once the run's stream has completed (the run is over).
        events.TryWrite(new AgentResponseUpdate(ChatRole.Assistant, [new AguiEventContent(evt)]));
    }
}

/// <summary>Per-run <see cref="SubagentRun"/>s, keyed by the run's <see cref="RunAgentInput"/> (one per request).</summary>
public sealed class SubagentHub
{
    private readonly ConditionalWeakTable<RunAgentInput, SubagentRun> _runs = new();

    public void Register(SubagentRun run) => _runs.AddOrUpdate(run.Input, run);

    /// <summary>The run that owns <paramref name="options"/>, or null when sub-agents are off for it.</summary>
    public SubagentRun? ForRun(ChatOptions? options) =>
        options is not null && options.TryGetRunAgentInput(out var input) && input is not null && _runs.TryGetValue(input, out var run)
            ? run
            : null;
}

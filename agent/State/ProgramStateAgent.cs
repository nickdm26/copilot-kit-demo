using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.State;

/// <summary>
/// Reads the client's program from RunAgentInput.State (via <c>ChatOptions.TryGetRunAgentInput</c>), seeds the run's
/// working copy with it, and puts it in front of the model as a system message (CONTRACTS section 9, Plan A).
/// </summary>
/// <remarks>
/// It also keeps the browser-facing result of updateProgram a full ProgramState (CONTRACTS section 3). When a call is
/// rejected, the model gets the error text, but <c>MapResultAsStateSnapshot</c> needs a JsonElement and turns any other
/// result into RUN_ERROR, so the outbound copy of that result is replaced with the unchanged state.
/// </remarks>
public sealed class ProgramStateAgent(AIAgent innerAgent, ProgramStateStore store) : DelegatingAIAgent(innerAgent)
{
    public const string StateMessagePrefix = "Current program state (ProgramState JSON).";

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
        if (options is not ChatClientAgentRunOptions { ChatOptions: { } chatOptions } || store.ForRun(chatOptions) is not { } copy)
        {
            return InnerAgent.RunStreamingAsync(messages, session, options, cancellationToken);
        }

        ProgramState state;
        lock (copy.Gate) state = copy.State;
        return KeepResultsAsState(
            InnerAgent.RunStreamingAsync(WithStateMessage(messages, state), session, options, cancellationToken), copy, cancellationToken);
    }

    /// <summary>
    /// Inserts the state message just before the latest user message. Next to the request it outweighs the older
    /// updateProgram results further up the history, which no longer show the trainer's edits.
    /// </summary>
    public static List<ChatMessage> WithStateMessage(IEnumerable<ChatMessage> messages, ProgramState state)
    {
        var list = messages.ToList();
        var lastUser = list.FindLastIndex(m => m.Role == ChatRole.User);
        list.Insert(lastUser < 0 ? list.Count : lastUser, StateMessage(state));
        return list;
    }

    public static ChatMessage StateMessage(ProgramState state)
    {
        var json = JsonSerializer.Serialize(state, ContractJson.Options);
        var lead = state.Weeks.Count == 0
            ? "There is no program yet."
            : "This is exactly what the trainer sees in the grid now, including any edits the trainer made since your last " +
              $"{ToolNames.UpdateProgram} call. It replaces any program shown earlier in this conversation. Treat it as the truth and build on it.";
        return new ChatMessage(ChatRole.System, $"{StateMessagePrefix} {lead}\n{json}");
    }

    private static async IAsyncEnumerable<AgentResponseUpdate> KeepResultsAsState(
        IAsyncEnumerable<AgentResponseUpdate> updates,
        ProgramWorkingCopy copy,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var updateProgramCalls = new HashSet<string>();
        await foreach (var update in updates.WithCancellation(cancellationToken))
        {
            var rewrite = false;
            foreach (var content in update.Contents)
            {
                if (content is FunctionCallContent { Name: ToolNames.UpdateProgram } call) updateProgramCalls.Add(call.CallId);
                else if (content is FunctionResultContent { Result: not JsonElement } result && updateProgramCalls.Contains(result.CallId)) rewrite = true;
            }

            if (!rewrite)
            {
                yield return update;
                continue;
            }

            JsonElement current;
            lock (copy.Gate) current = JsonSerializer.SerializeToElement(copy.State, ContractJson.Options);

            // New objects only: the function-invoking loop keeps its own copy, so the model still sees the error text.
            var chat = update.AsChatResponseUpdate().Clone();
            chat.Contents = [.. update.Contents.Select(c =>
                c is FunctionResultContent { Result: not JsonElement } r && updateProgramCalls.Contains(r.CallId)
                    ? new FunctionResultContent(r.CallId, current)
                    : c)];
            yield return new AgentResponseUpdate(chat) { AgentId = update.AgentId };
        }
    }
}

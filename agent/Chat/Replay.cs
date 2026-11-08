using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using AGUI.Server;
using Microsoft.Extensions.AI;

namespace PtCoach.Agent.Chat;

/// <summary>One model turn: the assistant text and the tool calls it made, after an optional think time.</summary>
public sealed record ReplayTurn(
    [property: JsonPropertyName("text")] string? Text,
    [property: JsonPropertyName("calls")] IReadOnlyList<ReplayCall> Calls,
    [property: JsonPropertyName("delayMs")] int? DelayMs = null);

/// <summary>
/// The recording for runs with parallel sub-agents on (CONTRACTS section 11): the coach's turns, and each
/// sub-agent's turns by task key ("build-day:1:Mon", "build-week:2", "injury-screen").
/// </summary>
public sealed record ParallelRecording(
    [property: JsonPropertyName("coach")] IReadOnlyList<ReplayTurn> Coach,
    [property: JsonPropertyName("subagents")] IReadOnlyDictionary<string, IReadOnlyList<ReplayTurn>> Subagents);

public sealed record ReplayCall(
    [property: JsonPropertyName("callId")] string CallId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("arguments")] Dictionary<string, JsonElement> Arguments);

public static class ReplayJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    /// <summary>
    /// ChatOptions.AdditionalProperties key a sub-agent's requests carry: "{threadId}|{task key}", where the task key is
    /// "build-day:1:Mon", "build-week:2" or "injury-screen". Sub-agent requests have no AG-UI input of their own.
    /// </summary>
    public const string SubagentKey = "ptcoach.subagent";

    /// <summary>The AG-UI thread id of the current run, or null outside an AG-UI request.</summary>
    public static string? ThreadId(ChatOptions? options) =>
        options is not null && options.TryGetRunAgentInput(out var input) && input is not null ? input.ThreadId : null;

    /// <summary>The sub-agent request tag ("{threadId}|{task key}"), or null for a coach request.</summary>
    public static (string Thread, string Task)? Subagent(ChatOptions? options) =>
        options?.AdditionalProperties?.TryGetValue(SubagentKey, out var value) == true && value is string key && key.IndexOf('|') is var bar and >= 0
            ? (key[..bar], key[(bar + 1)..])
            : null;

    /// <summary>True for a coach request on a run with the parallel sub-agents toggle on.</summary>
    public static bool IsParallel(ChatOptions? options) =>
        options is not null && options.TryGetRunAgentInput(out var input) && input is not null &&
        PtCoach.Agent.Subagents.SubagentStreamAgent.IsEnabled(input);
}

/// <summary>
/// The <c>replay</c> model: plays a recorded run back turn by turn, per AG-UI thread. No network, no API key.
/// Backend tools still run for real on the recorded calls, so the grid fills through the normal state path.
/// </summary>
public sealed class ReplayChatClient(
    IReadOnlyList<ReplayTurn> turns, TimeSpan textDelay, TimeSpan callDelay, ParallelRecording? parallel = null) : IChatClient
{
    public const string EndOfRecording = "That's the end of the recorded demo. Pick a live model to keep going.";
    public const string NoSubagentRecording = "There is no recording for this sub-agent.";

    private readonly ConcurrentDictionary<string, int> _nextTurn = new();

    public static ReplayChatClient Load(string path, TimeSpan textDelay, TimeSpan callDelay, string? parallelPath = null)
    {
        if (!File.Exists(path))
        {
            throw new InvalidOperationException($"Replay recording not found at '{path}'.");
        }
        var turns = JsonSerializer.Deserialize<List<ReplayTurn>>(File.ReadAllText(path), ReplayJson.Options)
            ?? throw new InvalidOperationException($"Replay recording '{path}' is empty.");
        var parallel = parallelPath is not null && File.Exists(parallelPath)
            ? JsonSerializer.Deserialize<ParallelRecording>(File.ReadAllText(parallelPath), ReplayJson.Options)
            : null;
        return new ReplayChatClient(turns, textDelay, callDelay, parallel);
    }

    /// <summary>Which recording a request plays, and the counter that tracks its position.</summary>
    private (string Counter, IReadOnlyList<ReplayTurn> Turns, string End) Pick(ChatOptions? options)
    {
        if (ReplayJson.Subagent(options) is var (thread, task))
        {
            return ($"sub|{thread}|{task}", parallel?.Subagents.GetValueOrDefault(task) ?? [], NoSubagentRecording);
        }
        var coachThread = ReplayJson.ThreadId(options) ?? "";
        return parallel is not null && ReplayJson.IsParallel(options)
            ? ($"parallel|{coachThread}", parallel.Coach, EndOfRecording)
            : (coachThread, turns, EndOfRecording);
    }

    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        GetStreamingResponseAsync(messages, options, cancellationToken).ToChatResponseAsync(cancellationToken);

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var (counter, recording, end) = Pick(options);
        var index = _nextTurn.AddOrUpdate(counter, 1, (_, n) => n + 1) - 1;
        var turn = index < recording.Count ? recording[index] : new ReplayTurn(end, []);
        var responseId = $"replay-{Guid.NewGuid():N}";

        if (turn.DelayMs is int think && think > 0 && textDelay > TimeSpan.Zero)
        {
            await Task.Delay(think, cancellationToken); // "thinking"; skipped when tests zero the delays
        }

        if (!string.IsNullOrEmpty(turn.Text))
        {
            // Stream the text in small chunks so it reads like a live model.
            for (var i = 0; i < turn.Text.Length; i += 24)
            {
                await Task.Delay(textDelay, cancellationToken);
                yield return Update(responseId, new TextContent(turn.Text.Substring(i, Math.Min(24, turn.Text.Length - i))));
            }
        }

        foreach (var call in turn.Calls)
        {
            await Task.Delay(callDelay, cancellationToken);
            var args = call.Arguments.ToDictionary(a => a.Key, a => (object?)a.Value);
            yield return Update(responseId, new FunctionCallContent(call.CallId, call.Name, args));
        }

        yield return new ChatResponseUpdate(ChatRole.Assistant, [])
        {
            ResponseId = responseId,
            MessageId = responseId,
            ModelId = "replay",
            FinishReason = turn.Calls.Count > 0 ? ChatFinishReason.ToolCalls : ChatFinishReason.Stop,
        };
    }

    private static ChatResponseUpdate Update(string responseId, AIContent content) =>
        new(ChatRole.Assistant, [content]) { ResponseId = responseId, MessageId = responseId, ModelId = "replay" };

    public object? GetService(Type serviceType, object? serviceKey = null) =>
        serviceKey is null && serviceType.IsInstanceOfType(this) ? this : null;

    public void Dispose() { }
}

/// <summary>
/// Records every model turn of a live run to <c>{directory}/{threadId}.json</c>, in the format <see cref="ReplayChatClient"/> plays.
/// Enabled only when <c>Replay:RecordDirectory</c> is set. Recordings hold prompts' outputs, never the API key.
/// </summary>
public sealed class RecordingChatClient(IChatClient inner, string directory) : DelegatingChatClient(inner)
{
    private static readonly ConcurrentDictionary<string, object> Locks = new();

    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var updates = new List<ChatResponseUpdate>();
        try
        {
            await foreach (var update in base.GetStreamingResponseAsync(messages, options, cancellationToken))
            {
                updates.Add(update);
                yield return update;
            }
        }
        finally
        {
            // In finally: the caller often stops reading once it has a client-side tool call, which disposes this iterator.
            Record(updates, options);
        }
    }

    private void Record(List<ChatResponseUpdate> updates, ChatOptions? options)
    {
        var response = updates.ToChatResponse();
        var contents = response.Messages.SelectMany(m => m.Contents).ToList();
        var text = string.Concat(contents.OfType<TextContent>().Select(t => t.Text));
        var calls = contents.OfType<FunctionCallContent>()
            .Select(c => new ReplayCall(
                c.CallId,
                c.Name,
                (c.Arguments ?? new Dictionary<string, object?>()).ToDictionary(
                    a => a.Key, a => JsonSerializer.SerializeToElement(a.Value, ReplayJson.Options))))
            .ToList();
        var turn = new ReplayTurn(string.IsNullOrEmpty(text) ? null : text, calls);
        if (ReplayJson.Subagent(options) is var (thread, task))
        {
            AppendParallel(thread, turn, task);
        }
        else if (ReplayJson.IsParallel(options))
        {
            AppendParallel(ReplayJson.ThreadId(options) ?? "no-thread", turn, task: null);
        }
        else
        {
            Append(ReplayJson.ThreadId(options) ?? "no-thread", turn);
        }
    }

    /// <summary>Runs with sub-agents on go to <c>{thread}.parallel.json</c>, in the <see cref="ParallelRecording"/> format.</summary>
    private void AppendParallel(string thread, ReplayTurn turn, string? task)
    {
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, $"{string.Concat(thread.Where(char.IsLetterOrDigit))}.parallel.json");
        lock (Locks.GetOrAdd(path, _ => new object()))
        {
            var current = File.Exists(path)
                ? JsonSerializer.Deserialize<ParallelRecording>(File.ReadAllText(path), ReplayJson.Options)
                : null;
            var coach = current?.Coach.ToList() ?? [];
            var subagents = current?.Subagents.ToDictionary(kv => kv.Key, kv => kv.Value.ToList()) ?? [];
            if (task is null) coach.Add(turn);
            else (subagents.TryGetValue(task, out var list) ? list : subagents[task] = []).Add(turn);
            var next = new ParallelRecording(coach, subagents.ToDictionary(kv => kv.Key, kv => (IReadOnlyList<ReplayTurn>)kv.Value));
            File.WriteAllText(path, JsonSerializer.Serialize(next, ReplayJson.Options));
        }
    }

    public override Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        GetStreamingResponseAsync(messages, options, cancellationToken).ToChatResponseAsync(cancellationToken);

    private void Append(string thread, ReplayTurn turn)
    {
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, $"{string.Concat(thread.Where(char.IsLetterOrDigit))}.json");
        lock (Locks.GetOrAdd(path, _ => new object()))
        {
            var turns = File.Exists(path)
                ? JsonSerializer.Deserialize<List<ReplayTurn>>(File.ReadAllText(path), ReplayJson.Options) ?? []
                : [];
            turns.Add(turn);
            File.WriteAllText(path, JsonSerializer.Serialize(turns, ReplayJson.Options));
        }
    }
}

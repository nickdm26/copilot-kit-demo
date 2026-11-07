using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using AGUI.Server;
using Microsoft.Extensions.AI;

namespace PtCoach.Agent.Chat;

/// <summary>One model turn: the assistant text and the tool calls it made.</summary>
public sealed record ReplayTurn(
    [property: JsonPropertyName("text")] string? Text,
    [property: JsonPropertyName("calls")] IReadOnlyList<ReplayCall> Calls);

public sealed record ReplayCall(
    [property: JsonPropertyName("callId")] string CallId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("arguments")] Dictionary<string, JsonElement> Arguments);

public static class ReplayJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    /// <summary>The AG-UI thread id of the current run, or null outside an AG-UI request.</summary>
    public static string? ThreadId(ChatOptions? options) =>
        options is not null && options.TryGetRunAgentInput(out var input) && input is not null ? input.ThreadId : null;
}

/// <summary>
/// The <c>replay</c> model: plays a recorded run back turn by turn, per AG-UI thread. No network, no API key.
/// Backend tools still run for real on the recorded calls, so the grid fills through the normal state path.
/// </summary>
public sealed class ReplayChatClient(IReadOnlyList<ReplayTurn> turns, TimeSpan textDelay, TimeSpan callDelay) : IChatClient
{
    public const string EndOfRecording = "That's the end of the recorded demo. Pick a live model to keep going.";

    private readonly ConcurrentDictionary<string, int> _nextTurn = new();

    public static ReplayChatClient Load(string path, TimeSpan textDelay, TimeSpan callDelay)
    {
        if (!File.Exists(path))
        {
            throw new InvalidOperationException($"Replay recording not found at '{path}'.");
        }
        var turns = JsonSerializer.Deserialize<List<ReplayTurn>>(File.ReadAllText(path), ReplayJson.Options)
            ?? throw new InvalidOperationException($"Replay recording '{path}' is empty.");
        return new ReplayChatClient(turns, textDelay, callDelay);
    }

    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        GetStreamingResponseAsync(messages, options, cancellationToken).ToChatResponseAsync(cancellationToken);

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var thread = ReplayJson.ThreadId(options) ?? "";
        var index = _nextTurn.AddOrUpdate(thread, 1, (_, n) => n + 1) - 1;
        var turn = index < turns.Count ? turns[index] : new ReplayTurn(EndOfRecording, []);
        var responseId = $"replay-{Guid.NewGuid():N}";

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
        Append(ReplayJson.ThreadId(options) ?? "no-thread", new ReplayTurn(string.IsNullOrEmpty(text) ? null : text, calls));
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

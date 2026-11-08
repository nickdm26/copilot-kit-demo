using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;
using OpenAI.Chat;

// OpenAI.Chat also has ChatMessage and ChatRole; the M.E.AI ones are the ones this client speaks.
using ChatMessage = Microsoft.Extensions.AI.ChatMessage;
using ChatRole = Microsoft.Extensions.AI.ChatRole;

namespace PtCoach.Agent.Chat;

/// <summary>
/// Surfaces model reasoning as <see cref="TextReasoningContent"/> so the AG-UI host can emit REASONING_* events.
///
/// <para>
/// <c>Microsoft.Extensions.AI.OpenAI</c> 10.11.0 only reads <c>$.choices[0].delta.reasoning_content</c>, but
/// OpenRouter (and DeepSeek, vLLM and others) stream the same text as <c>reasoning</c>. Without this bridge the
/// reasoning is dropped before it reaches AG-UI, so neither the chat's "Thought for Ns" block nor the inspector's
/// REASONING_* rows ever appear.
/// </para>
/// <para>
/// Content the inner client already produced is left alone, so this becomes a no-op if a later
/// <c>Microsoft.Extensions.AI.OpenAI</c> learns the <c>reasoning</c> field itself.
/// </para>
/// </summary>
public sealed class ReasoningChatClient(IChatClient inner) : DelegatingChatClient(inner)
{
    // The field OpenRouter uses. M.E.AI reads the sibling "reasoning_content" spelling.
    private static ReadOnlySpan<byte> StreamingPath => "$.choices[0].delta.reasoning"u8;
    private static ReadOnlySpan<byte> NonStreamingPath => "$.choices[0].message.reasoning"u8;

    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await foreach (var update in base.GetStreamingResponseAsync(messages, options, cancellationToken))
        {
            AddReasoning(update);
            yield return update;
        }
    }

    public override async Task<ChatResponse> GetResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var response = await base.GetResponseAsync(messages, options, cancellationToken);
        if (response.RawRepresentation is ChatCompletion completion
            && TryRead(completion, NonStreamingPath, out var text)
            && !HasReasoning(response))
        {
            // Reasoning belongs before the answer it explains.
            var message = response.Messages.FirstOrDefault(m => m.Role == ChatRole.Assistant);
            if (message is not null) message.Contents.Insert(0, new TextReasoningContent(text));
        }
        return response;
    }

    private static void AddReasoning(ChatResponseUpdate update)
    {
        if (update.RawRepresentation is not StreamingChatCompletionUpdate raw) return;
        if (!TryRead(raw, StreamingPath, out var text)) return;
        // A client that already emits reasoning wins; adding a second copy would duplicate every token.
        if (update.Contents.OfType<TextReasoningContent>().Any()) return;

        // OpenRouter sends "content": "" on every reasoning chunk, which arrives as an empty TextContent. The AG-UI
        // host closes the open reasoning block whenever it sees text, so leaving it in splits the reasoning into one
        // block per token. An empty text part carries nothing, so drop it.
        for (var i = update.Contents.Count - 1; i >= 0; i--)
        {
            if (update.Contents[i] is TextContent { Text.Length: 0 }) update.Contents.RemoveAt(i);
        }

        update.Contents.Insert(0, new TextReasoningContent(text));
    }

    private static bool HasReasoning(ChatResponse response) =>
        response.Messages.Any(m => m.Contents.OfType<TextReasoningContent>().Any());

#pragma warning disable SCME0001 // JsonPatch is experimental; it is the only way to read a field the SDK does not model.
    private static bool TryRead(StreamingChatCompletionUpdate update, ReadOnlySpan<byte> path, out string text) =>
        update.Patch.TryGetValue(path, out text!) && !string.IsNullOrEmpty(text);

    private static bool TryRead(ChatCompletion completion, ReadOnlySpan<byte> path, out string text) =>
        completion.Patch.TryGetValue(path, out text!) && !string.IsNullOrEmpty(text);
#pragma warning restore SCME0001
}

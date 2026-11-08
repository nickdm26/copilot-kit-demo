using System.ClientModel.Primitives;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;
using OpenAI.Chat;
using PtCoach.Agent.Chat;
using ChatMessage = Microsoft.Extensions.AI.ChatMessage;
using ChatRole = Microsoft.Extensions.AI.ChatRole;

namespace PtCoach.Agent.Tests;

/// <summary>
/// The bridge that turns OpenRouter's <c>reasoning</c> field into <see cref="TextReasoningContent"/>, which is what
/// the AG-UI host needs to emit REASONING_* events.
/// </summary>
public sealed class ReasoningChatClientTests
{
    /// <summary>Streams the given updates unchanged.</summary>
    private sealed class FakeClient(params ChatResponseUpdate[] updates) : IChatClient
    {
        public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> m, ChatOptions? o = null, CancellationToken ct = default) =>
            Task.FromResult(new ChatResponse(new ChatMessage(ChatRole.Assistant, "ok")));

        public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
            IEnumerable<ChatMessage> m, ChatOptions? o = null, [EnumeratorCancellation] CancellationToken ct = default)
        {
            foreach (var u in updates)
            {
                await Task.Yield();
                yield return u;
            }
        }

        public object? GetService(Type serviceType, object? serviceKey = null) => null;
        public void Dispose() { }
    }

    /// <summary>Builds the OpenAI SDK's own update type from wire JSON, so the test uses the real Patch.</summary>
    private static StreamingChatCompletionUpdate Raw(string deltaJson) =>
        ModelReaderWriter.Read<StreamingChatCompletionUpdate>(BinaryData.FromString($$"""
            {
              "id": "chatcmpl-1",
              "object": "chat.completion.chunk",
              "created": 1700000000,
              "model": "deepseek/deepseek-v4.1-flash-1017",
              "choices": [ { "index": 0, "delta": {{deltaJson}}, "finish_reason": null } ]
            }
            """))!;

    private static ChatResponseUpdate UpdateWith(string deltaJson) =>
        new(ChatRole.Assistant, []) { RawRepresentation = Raw(deltaJson) };

    private static async Task<List<ChatResponseUpdate>> Collect(IChatClient client)
    {
        var seen = new List<ChatResponseUpdate>();
        await foreach (var u in client.GetStreamingResponseAsync(
            [new ChatMessage(ChatRole.User, "hi")], null, TestContext.Current.CancellationToken))
        {
            seen.Add(u);
        }
        return seen;
    }

    [Fact]
    public async Task Reasoning_field_becomes_reasoning_content()
    {
        var client = new ReasoningChatClient(new FakeClient(UpdateWith("""{ "reasoning": "17*23 = 391" }""")));

        var updates = await Collect(client);

        var reasoning = Assert.Single(updates).Contents.OfType<TextReasoningContent>().Single();
        Assert.Equal("17*23 = 391", reasoning.Text);
    }

    [Fact]
    public async Task Reasoning_is_placed_before_the_answer_text()
    {
        var update = UpdateWith("""{ "reasoning": "think first", "content": "391" }""");
        update.Contents.Add(new TextContent("391"));

        var updates = await Collect(new ReasoningChatClient(new FakeClient(update)));

        // Reasoning explains the answer, so it must not render after it.
        Assert.IsType<TextReasoningContent>(Assert.Single(updates).Contents[0]);
    }

    [Fact]
    public async Task Updates_without_reasoning_are_untouched()
    {
        var update = UpdateWith("""{ "content": "391" }""");
        update.Contents.Add(new TextContent("391"));

        var updates = await Collect(new ReasoningChatClient(new FakeClient(update)));

        Assert.Empty(Assert.Single(updates).Contents.OfType<TextReasoningContent>());
    }

    [Fact]
    public async Task Updates_without_a_raw_representation_are_untouched()
    {
        var update = new ChatResponseUpdate(ChatRole.Assistant, "391");

        var updates = await Collect(new ReasoningChatClient(new FakeClient(update)));

        Assert.Empty(Assert.Single(updates).Contents.OfType<TextReasoningContent>());
    }

    [Fact]
    public async Task Reasoning_the_inner_client_already_produced_is_not_duplicated()
    {
        // A future Microsoft.Extensions.AI.OpenAI may read "reasoning" itself; the bridge must then do nothing.
        var update = UpdateWith("""{ "reasoning": "17*23 = 391" }""");
        update.Contents.Add(new TextReasoningContent("17*23 = 391"));

        var updates = await Collect(new ReasoningChatClient(new FakeClient(update)));

        Assert.Single(Assert.Single(updates).Contents.OfType<TextReasoningContent>());
    }

    [Fact]
    public async Task Empty_reasoning_is_ignored()
    {
        var updates = await Collect(new ReasoningChatClient(new FakeClient(UpdateWith("""{ "reasoning": "" }"""))));

        Assert.Empty(Assert.Single(updates).Contents.OfType<TextReasoningContent>());
    }

    [Fact]
    public async Task Empty_content_beside_reasoning_is_dropped()
    {
        // OpenRouter sends "content": "" on every reasoning chunk. Left in, the AG-UI host treats it as text and
        // closes the reasoning block, so the chat shows one "Thought for…" per token instead of one per run.
        var update = UpdateWith("""{ "content": "", "reasoning": "We" }""");
        update.Contents.Add(new TextContent(""));

        var updates = await Collect(new ReasoningChatClient(new FakeClient(update)));

        var contents = Assert.Single(updates).Contents;
        Assert.Single(contents);
        Assert.IsType<TextReasoningContent>(contents[0]);
    }

    [Fact]
    public async Task Real_content_beside_reasoning_is_kept()
    {
        var update = UpdateWith("""{ "content": "391", "reasoning": "We" }""");
        update.Contents.Add(new TextContent("391"));

        var updates = await Collect(new ReasoningChatClient(new FakeClient(update)));

        var contents = Assert.Single(updates).Contents;
        Assert.Equal(2, contents.Count);
        Assert.IsType<TextReasoningContent>(contents[0]);
        Assert.Equal("391", Assert.IsType<TextContent>(contents[1]).Text);
    }

    [Fact]
    public async Task Every_chunk_of_a_streamed_reasoning_run_is_forwarded_in_order()
    {
        var client = new ReasoningChatClient(new FakeClient(
            UpdateWith("""{ "reasoning": "17*20 " }"""),
            UpdateWith("""{ "reasoning": "= 340, " }"""),
            UpdateWith("""{ "reasoning": "+ 51 = 391" }""")));

        var updates = await Collect(client);

        Assert.Equal(
            ["17*20 ", "= 340, ", "+ 51 = 391"],
            updates.Select(u => Assert.Single(u.Contents.OfType<TextReasoningContent>()).Text));
    }
}

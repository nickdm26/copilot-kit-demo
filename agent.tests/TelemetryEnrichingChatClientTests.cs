using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;
using PtCoach.Agent.Telemetry;

namespace PtCoach.Agent.Tests;

/// <summary>Error recording, privacy and robustness of the span enrichment.</summary>
public sealed class TelemetryEnrichingChatClientTests : IDisposable
{
    private readonly ActivitySource source = new($"PtCoach.Tests.{Guid.NewGuid():N}");
    private readonly ActivityListener listener;

    public TelemetryEnrichingChatClientTests()
    {
        listener = new ActivityListener
        {
            ShouldListenTo = s => s.Name == source.Name,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
        };
        ActivitySource.AddActivityListener(listener);
    }

    public void Dispose()
    {
        listener.Dispose();
        source.Dispose();
    }

    /// <summary>Streams the given updates, then optionally fails.</summary>
    private sealed class FakeClient(IReadOnlyList<ChatResponseUpdate> updates, Func<CancellationToken, Exception>? fail = null)
        : IChatClient
    {
        public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> m, ChatOptions? o = null, CancellationToken ct = default) =>
            fail is null ? Task.FromResult(new ChatResponse(new ChatMessage(ChatRole.Assistant, "ok"))) : throw fail(ct);

        public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
            IEnumerable<ChatMessage> m, ChatOptions? o = null, [EnumeratorCancellation] CancellationToken ct = default)
        {
            foreach (var u in updates)
            {
                await Task.Yield();
                yield return u;
            }
            if (fail is not null) throw fail(ct);
        }

        public object? GetService(Type serviceType, object? serviceKey = null) => null;
        public void Dispose() { }
    }

    private static ChatResponseUpdate Text(string text) => new(ChatRole.Assistant, text);

    private static async Task Drain(IChatClient client, CancellationToken ct = default)
    {
        await foreach (var _ in client.GetStreamingResponseAsync([new ChatMessage(ChatRole.User, "hi")], null, ct)) { }
    }

    [Fact]
    public async Task Streaming_timeout_is_recorded_on_the_span()
    {
        // An HttpClient timeout surfaces as TaskCanceledException although the caller did not cancel.
        var client = new TelemetryEnrichingChatClient(
            new FakeClient([Text("partial")], _ => new TaskCanceledException("timed out", new TimeoutException())));

        using var activity = source.StartActivity("chat")!;
        await Assert.ThrowsAsync<TaskCanceledException>(() => Drain(client, TestContext.Current.CancellationToken));

        Assert.Equal(ActivityStatusCode.Error, activity.Status);
        Assert.Contains(activity.Events, e => e.Name == "exception");
    }

    [Fact]
    public async Task Caller_cancellation_is_not_an_error()
    {
        using var cts = new CancellationTokenSource();
        var client = new TelemetryEnrichingChatClient(new FakeClient([Text("partial")], ct =>
        {
            cts.Cancel();
            return new OperationCanceledException(cts.Token);
        }));

        using var activity = source.StartActivity("chat")!;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => Drain(client, cts.Token));

        Assert.NotEqual(ActivityStatusCode.Error, activity.Status);
        Assert.DoesNotContain(activity.Events, e => e.Name == "exception");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Swap_reason_is_recorded_only_when_content_capture_is_on(bool capture)
    {
        var call = new FunctionCallContent("call-1", ToolNames.ProposeSwap, new Dictionary<string, object?>
        {
            ["fromExerciseId"] = "overhead-press",
            ["toExerciseId"] = "landmine-press",
            ["reason"] = "left shoulder impingement",
        });
        var client = new TelemetryEnrichingChatClient(
            new FakeClient([new ChatResponseUpdate(ChatRole.Assistant, [call])]), capture);

        using var activity = source.StartActivity("chat")!;
        await Drain(client, TestContext.Current.CancellationToken);

        var proposed = Assert.Single(activity.Events, e => e.Name == AgentTelemetry.EventApprovalProposed);
        var tags = proposed.Tags.ToDictionary(t => t.Key, t => t.Value);
        Assert.Equal("overhead-press", tags[AgentTelemetry.AttrApprovalFromExercise]);
        Assert.Equal(capture, tags.ContainsKey(AgentTelemetry.AttrApprovalReason));
    }

    [Theory]
    [InlineData("\"approved\"")]          // a JSON string, not an object
    [InlineData("{ \"approved\": \"yes\" }")] // approved is not a boolean
    [InlineData("[]")]
    public async Task Odd_swap_results_never_throw(string resultJson)
    {
        var call = new FunctionCallContent("call-2", ToolNames.ProposeSwap, new Dictionary<string, object?>());
        var client = new TelemetryEnrichingChatClient(new FakeClient([new ChatResponseUpdate(ChatRole.Assistant, [call])]));
        using var activity = source.StartActivity("chat")!;
        await Drain(client, TestContext.Current.CancellationToken);

        // The next turn carries the result of that call.
        var result = new FunctionResultContent("call-2", JsonDocument.Parse(resultJson).RootElement.Clone());
        await foreach (var _ in client.GetStreamingResponseAsync(
            [new ChatMessage(ChatRole.Tool, [result])], null, TestContext.Current.CancellationToken)) { }

        var decision = Assert.Single(activity.Events, e => e.Name == AgentTelemetry.EventApprovalDecision);
        Assert.Equal("rejected", decision.Tags.Single(t => t.Key == AgentTelemetry.AttrApprovalStatus).Value);
    }
}

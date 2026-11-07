using System.Text.Json;
using AGUI.Abstractions;
using AGUI.Server;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Chat;

namespace PtCoach.Agent.Tests;

public class ReplayTests
{
    private static readonly IReadOnlyList<ReplayTurn> Turns =
    [
        new("Hello", []),
        new(null, [new ReplayCall("call-1", "showWeekSummary", new() { ["week"] = JsonSerializer.SerializeToElement(1) })]),
    ];

    private static ChatOptions OptionsFor(string threadId) =>
        new RunAgentInput { ThreadId = threadId, RunId = Guid.NewGuid().ToString() }
            .ToChatRequestContext(JsonSerializerOptions.Web, null).ChatOptions;

    private static ReplayChatClient Client() => new(Turns, TimeSpan.Zero, TimeSpan.Zero);

    private static Task<ChatResponse> Next(IChatClient client, string thread) =>
        client.GetResponseAsync([new ChatMessage(ChatRole.User, "hi")], OptionsFor(thread), TestContext.Current.CancellationToken);

    [Fact]
    public async Task Plays_turns_in_order_then_ends()
    {
        var client = Client();

        var first = await Next(client, "t1");
        Assert.Equal("Hello", first.Text);
        Assert.Equal(ChatFinishReason.Stop, first.FinishReason);

        var second = await Next(client, "t1");
        var call = Assert.Single(second.Messages.SelectMany(m => m.Contents).OfType<FunctionCallContent>());
        Assert.Equal("showWeekSummary", call.Name);
        Assert.Equal(1, ((JsonElement)call.Arguments!["week"]!).GetInt32());
        Assert.Equal(ChatFinishReason.ToolCalls, second.FinishReason);

        var third = await Next(client, "t1");
        Assert.Equal(ReplayChatClient.EndOfRecording, third.Text);
    }

    [Fact]
    public async Task Threads_are_replayed_independently()
    {
        var client = Client();
        await Next(client, "a");
        Assert.Equal("Hello", (await Next(client, "b")).Text);
    }

    [Fact]
    public async Task Recorder_writes_turns_that_replay_reads_back()
    {
        var dir = Path.Combine(Path.GetTempPath(), $"replay-test-{Guid.NewGuid():N}");
        try
        {
            var recorder = new RecordingChatClient(Client(), dir);
            await Next(recorder, "rec");
            await Next(recorder, "rec");

            var file = Assert.Single(Directory.GetFiles(dir));
            var replay = ReplayChatClient.Load(file, TimeSpan.Zero, TimeSpan.Zero);
            Assert.Equal("Hello", (await Next(replay, "x")).Text);
            var call = Assert.Single((await Next(replay, "x")).Messages.SelectMany(m => m.Contents).OfType<FunctionCallContent>());
            Assert.Equal("call-1", call.CallId);
        }
        finally
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void Shipped_recording_loads()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Replay", "demo-run.json");
        var turns = JsonSerializer.Deserialize<List<ReplayTurn>>(File.ReadAllText(path), ReplayJson.Options)!;
        Assert.Contains(turns, t => t.Calls.Any(c => c.Name == "proposeSwap"));
        var weeks = turns.SelectMany(t => t.Calls)
            .Where(c => c.Name == "updateProgram" && c.Arguments.ContainsKey("days"))
            .SelectMany(c => c.Arguments["days"].EnumerateArray().Select(d => d.GetProperty("week").GetInt32()))
            .ToHashSet();
        Assert.Equal([1, 2, 3, 4], weeks.Order());
    }
}

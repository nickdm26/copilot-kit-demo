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

    private static ChatOptions ParallelOptionsFor(string threadId) =>
        new RunAgentInput
        {
            ThreadId = threadId,
            RunId = Guid.NewGuid().ToString(),
            Context = [new AGUIContext { Description = PtCoach.Agent.Models.SubagentContext.Description, Value = """{"enabled":true}""" }],
        }.ToChatRequestContext(JsonSerializerOptions.Web, null).ChatOptions;

    private static ChatOptions SubagentOptions(string threadId, string task) =>
        new() { AdditionalProperties = new() { [ReplayJson.SubagentKey] = $"{threadId}|{task}" } };

    [Fact]
    public async Task Parallel_runs_and_each_subagent_play_their_own_recordings()
    {
        var parallel = new ParallelRecording(
            [new("Coach in parallel mode", [])],
            new Dictionary<string, IReadOnlyList<ReplayTurn>>
            {
                ["build-day:1:Mon"] = [new("Mon 1", []), new("Mon 2", [])],
                ["injury-screen"] = [new("Screen 1", [])],
            });
        var client = new ReplayChatClient(Turns, TimeSpan.Zero, TimeSpan.Zero, parallel);
        var ct = TestContext.Current.CancellationToken;
        Task<ChatResponse> Ask(ChatOptions o) => client.GetResponseAsync([new ChatMessage(ChatRole.User, "hi")], o, ct);

        Assert.Equal("Coach in parallel mode", (await Ask(ParallelOptionsFor("t"))).Text);
        Assert.Equal("Hello", (await Ask(OptionsFor("t"))).Text); // the toggle-off recording keeps its own position
        Assert.Equal("Mon 1", (await Ask(SubagentOptions("t", "build-day:1:Mon"))).Text);
        Assert.Equal("Screen 1", (await Ask(SubagentOptions("t", "injury-screen"))).Text);
        Assert.Equal("Mon 2", (await Ask(SubagentOptions("t", "build-day:1:Mon"))).Text);
        Assert.Equal("Mon 1", (await Ask(SubagentOptions("other-thread", "build-day:1:Mon"))).Text);
        Assert.Equal(ReplayChatClient.NoSubagentRecording, (await Ask(SubagentOptions("t", "build-week:9"))).Text);
    }

    [Fact]
    public async Task Recorder_writes_parallel_runs_in_the_parallel_format()
    {
        var dir = Path.Combine(Path.GetTempPath(), $"replay-test-{Guid.NewGuid():N}");
        try
        {
            var recorder = new RecordingChatClient(Client(), dir);
            var ct = TestContext.Current.CancellationToken;
            await recorder.GetResponseAsync([new ChatMessage(ChatRole.User, "hi")], ParallelOptionsFor("rec"), ct);
            await recorder.GetResponseAsync([new ChatMessage(ChatRole.User, "hi")], SubagentOptions("rec", "injury-screen"), ct);

            var file = Assert.Single(Directory.GetFiles(dir));
            Assert.EndsWith("rec.parallel.json", file);
            var recording = JsonSerializer.Deserialize<ParallelRecording>(File.ReadAllText(file), ReplayJson.Options)!;
            Assert.Equal("Hello", Assert.Single(recording.Coach).Text);
            Assert.Single(recording.Subagents["injury-screen"]);
        }
        finally
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
    }

    /// <summary>
    /// Plays the shipped parallel recording's writes in order (approve path) against the real seed: every write and both
    /// runSubagents calls must be accepted, ending with 4 full weeks and no flags.
    /// </summary>
    [Fact]
    public void Shipped_parallel_recording_is_valid_against_the_real_seed()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Replay", "demo-run-parallel.json");
        var recording = JsonSerializer.Deserialize<ParallelRecording>(File.ReadAllText(path), ReplayJson.Options)!;
        var seed = new PtCoach.Agent.Seed.SeedStore(Path.Combine(AppContext.BaseDirectory, "Seed"));
        var exerciseIds = seed.Exercises.Select(e => e.Id).ToHashSet();
        var clientIds = seed.Clients.Select(c => c.Id).ToHashSet();
        var state = PtCoach.Agent.Models.ProgramState.Empty("");

        void Apply(PtCoach.Agent.Models.UpdateProgramArgs args)
        {
            state = PtCoach.Agent.State.ProgramUpdater.Apply(state, args);
            Assert.Empty(PtCoach.Agent.State.ProgramStateValidator.Validate(state, exerciseIds, clientIds));
        }

        T Args<T>(ReplayCall c) =>
            JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(c.Arguments), PtCoach.Agent.Models.ContractJson.Options)!;

        var runs = 0;
        foreach (var call in recording.Coach.SelectMany(t => t.Calls))
        {
            if (call.Name == "updateProgram") Apply(Args<PtCoach.Agent.Models.UpdateProgramArgs>(call));
            if (call.Name != "runSubagents") continue;
            runs++;
            var args = Args<PtCoach.Agent.Models.RunSubagentsArgs>(call);
            Apply(new(args.ClientId, args.Goal, args.DaysPerWeek));
            Assert.Null(PtCoach.Agent.Subagents.RunSubagentsTool.Problem(args.Tasks, state));
            foreach (var task in args.Tasks)
            {
                var key = task.Kind switch
                {
                    PtCoach.Agent.Models.SubagentKind.BuildDay => $"build-day:{task.Week}:{task.Day}",
                    PtCoach.Agent.Models.SubagentKind.BuildWeek => $"build-week:{task.Week}",
                    _ => "injury-screen",
                };
                var calls = recording.Subagents[key].SelectMany(t => t.Calls).ToList();
                Assert.Equal(task.Kind == PtCoach.Agent.Models.SubagentKind.InjuryScreen ? 0 : 1, calls.Count(c => c.Name is "writeDay" or "writeWeek"));
                foreach (var w in calls.Where(c => c.Name == "writeDay"))
                {
                    var d = Args<PtCoach.Agent.Models.WriteDayArgs>(w);
                    Apply(new(Days: [new(task.Week!.Value, task.Day!.Value, d.Focus, d.Exercises)]));
                }
                foreach (var w in calls.Where(c => c.Name == "writeWeek"))
                {
                    var wk = Args<PtCoach.Agent.Models.WriteWeekArgs>(w);
                    Apply(new(Days: [.. wk.Days.Select(d => new PtCoach.Agent.Models.ProgramDayUpsert(task.Week!.Value, d.Day, d.Focus, d.Exercises))]));
                }
            }
        }

        Assert.Equal(2, runs);
        Assert.Equal([1, 2, 3, 4], state.Weeks.Select(w => w.Number));
        Assert.All(state.Weeks, w => Assert.Equal(3, w.Days.Count));
        Assert.Empty(state.Flags);
        Assert.DoesNotContain(state.Weeks.SelectMany(w => w.Days).SelectMany(d => d.Exercises), e => e.ExerciseId == "overhead-press");
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

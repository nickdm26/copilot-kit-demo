using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PtCoach.Agent.Chat;
using PtCoach.Agent.Models;
using PtCoach.Agent.State;
using PtCoach.Agent.Subagents;

namespace PtCoach.Agent.Tests;

/// <summary>
/// Scripted model for the coach and its sub-agents. The coach calls runSubagents once (when offered) and then answers;
/// each sub-agent, told apart by its replay key, searches, writes and answers. Waits are staggered so the sub-agents overlap.
/// </summary>
public sealed class SubagentScriptedChatClient(string tasksJson) : IChatClient
{
    public ConcurrentQueue<(string? Subagent, List<string> Tools)> Requests { get; } = new();

    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        GetStreamingResponseAsync(messages, options, cancellationToken).ToChatResponseAsync(cancellationToken);

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var list = messages.ToList();
        var key = options?.AdditionalProperties?.TryGetValue(ReplayJson.SubagentKey, out var k) == true ? k as string : null;
        Requests.Enqueue((key, (options?.Tools ?? []).Select(t => t.Name).ToList()));
        var step = list.SelectMany(m => m.Contents).OfType<FunctionResultContent>().Count();
        var task = key?.Split('|')[1];

        if (task is null)
        {
            await Task.Yield();
            var offered = options?.Tools?.Any(t => t.Name == ToolNames.RunSubagents) == true;
            if (offered && step == 0)
            {
                var args = JsonSerializer.Deserialize<Dictionary<string, object?>>(tasksJson);
                yield return Call("coach-0", "parent-call", ToolNames.RunSubagents, args);
            }
            else
            {
                yield return new ChatResponseUpdate(ChatRole.Assistant, "Week 1 is built.") { MessageId = "coach-done" };
            }
            yield break;
        }

        // Stagger the sub-agents so their work interleaves on the wire; Mon is the slowest, so Wed writes first.
        await Task.Delay(task.Contains("Mon") ? 60 : 20, cancellationToken);
        if (task == "injury-screen")
        {
            yield return new ChatResponseUpdate(ChatRole.Assistant, "overhead-press -> ") { MessageId = "s-a" };
            yield return new ChatResponseUpdate(ChatRole.Assistant, "landmine-press: high shoulder stress.") { MessageId = "s-a" };
            yield break;
        }

        var isWed = task.Contains("Wed");
        switch (step)
        {
            case 0:
                yield return Call("b-0", "call_0", ToolNames.SearchExercises, new() { ["pattern"] = isWed ? "vertical-push" : "squat" });
                break;
            case 1:
                var exercises = isWed
                    ? """[{ "exerciseId": "overhead-press", "sets": 4, "reps": "5", "rpe": 7, "note": "" }, { "exerciseId": "face-pull", "sets": 3, "reps": "12", "rpe": 7, "note": "" }]"""
                    : """[{ "exerciseId": "back-squat", "sets": 4, "reps": "5", "rpe": 7, "note": "" }]""";
                yield return Call("b-1", "call_1", ToolNames.WriteDay, new()
                {
                    ["focus"] = isWed ? "Upper" : "Lower",
                    ["exercises"] = JsonDocument.Parse(exercises).RootElement.Clone(),
                });
                break;
            default:
                yield return new ChatResponseUpdate(ChatRole.Assistant, isWed ? "Upper day with overhead press." : "Squat-led lower day.") { MessageId = "b-2" };
                break;
        }
    }

    private static ChatResponseUpdate Call(string messageId, string callId, string name, Dictionary<string, object?>? args) =>
        new(ChatRole.Assistant, [new FunctionCallContent(callId, name, args)]) { MessageId = messageId };

    public object? GetService(Type serviceType, object? serviceKey = null) => null;

    public void Dispose() { }
}

public sealed class SingleChatClientFactory(IChatClient client) : IChatClientFactory
{
    public IChatClient Create(string modelKey) => client;
}

public class SubagentHostTests
{
    private const string WeekOneTasks = """
        { "clientId": "sarah", "goal": "strength", "daysPerWeek": 3, "tasks": [
          { "kind": "build-day", "week": 1, "day": "Mon", "focus": "Lower", "brief": "Squat-led lower day." },
          { "kind": "build-day", "week": 1, "day": "Wed", "focus": "Upper", "brief": "Pressing and pulling." },
          { "kind": "injury-screen", "brief": "Check her left shoulder." } ] }
        """;

    private static WebApplicationFactory<Program> CreateFactory(IChatClient chat) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Development");
            b.UseSetting("OpenRouter:ApiKey", "unused");
            b.UseSetting("Seed:Directory", Path.Combine(AppContext.BaseDirectory, "Fixtures"));
            b.UseSetting("Models:quick:label", "Quick");
            b.UseSetting("Models:quick:modelId", "test/quick-model");
            b.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IChatClientFactory>(new SingleChatClientFactory(chat))));
        });

    private static async Task<List<JsonElement>> Run(HttpClient http, bool subagents, string threadId)
    {
        var input = new
        {
            threadId,
            runId = "run-" + threadId,
            state = new { },
            messages = new[] { new { id = "u1", role = "user", content = "4 week strength block for Sarah" } },
            tools = Array.Empty<object>(),
            context = new[] { new { description = SubagentContext.Description, value = JsonSerializer.Serialize(new { enabled = subagents }) } },
            forwardedProps = new { },
        };
        var request = new HttpRequestMessage(HttpMethod.Post, "/agent/quick")
        {
            Content = new StringContent(JsonSerializer.Serialize(input), Encoding.UTF8, "application/json"),
        };
        request.Headers.Accept.ParseAdd("text/event-stream");
        var ct = TestContext.Current.CancellationToken;
        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        Assert.True(response.IsSuccessStatusCode, body);
        return body.Split('\n')
            .Where(l => l.StartsWith("data:", StringComparison.Ordinal))
            .Select(l => JsonDocument.Parse(l["data:".Length..]).RootElement.Clone())
            .ToList();
    }

    private static string Type(JsonElement e) => e.GetProperty("type").GetString()!;

    private static string Dump(List<JsonElement> events) =>
        string.Join(Environment.NewLine, events.Select(e => e.GetRawText() is var raw && raw.Length > 300 ? raw[..300] : raw));

    private static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    [Fact]
    public async Task Subagents_stream_attributed_events_inside_the_parent_call_and_write_the_grid()
    {
        var chat = new SubagentScriptedChatClient(WeekOneTasks);
        await using var factory = CreateFactory(chat);
        var events = await Run(factory.CreateClient(), subagents: true, "thread-sub");
        var types = events.Select(Type).ToList();
        Assert.True(types[^1] == "RUN_FINISHED", Dump(events));
        Assert.DoesNotContain("RUN_ERROR", types);

        // The coach's call opens and closes around all the sub-agent work.
        var parentEnd = events.FindIndex(e => Type(e) == "TOOL_CALL_END" && Str(e, "toolCallId") == "parent-call" && Str(e, "subagentRunId") is null);
        var parentResult = events.FindIndex(e => Type(e) == "TOOL_CALL_RESULT" && Str(e, "toolCallId") == "parent-call");
        Assert.True(parentEnd >= 0 && parentResult > parentEnd, string.Join(",", types));

        var started = events.Where(e => Type(e) == "SUBAGENT_STARTED").ToList();
        Assert.Equal(3, started.Count);
        Assert.All(started, s => Assert.Equal("parent-call", Str(s, "parentToolCallId")));
        Assert.Equal(["day-builder", "day-builder", "injury-screen"], started.Select(s => Str(s, "name")).Order());
        Assert.Contains("Week 1 · Wed · Upper", started.Select(s => Str(s, "description")));

        var ids = started.Select(s => Str(s, "subagentRunId")!).ToHashSet();
        var finished = events.Where(e => Type(e) == "SUBAGENT_FINISHED").ToList();
        Assert.Equal(ids, finished.Select(f => Str(f, "subagentRunId")!).ToHashSet());
        foreach (var id in ids)
        {
            // Everything a sub-agent did sits between its STARTED and FINISHED, and is attributed to it.
            var first = events.FindIndex(e => Type(e) == "SUBAGENT_STARTED" && Str(e, "subagentRunId") == id);
            var last = events.FindIndex(e => Type(e) == "SUBAGENT_FINISHED" && Str(e, "subagentRunId") == id);
            var own = events.Select((e, i) => (e, i)).Where(x => Type(x.e) != "SUBAGENT_STARTED" && Type(x.e) != "SUBAGENT_FINISHED" && Str(x.e, "subagentRunId") == id).ToList();
            Assert.NotEmpty(own);
            Assert.All(own, x => Assert.InRange(x.i, first + 1, last - 1));
            Assert.InRange(first, parentEnd + 1, parentResult - 1);
            Assert.InRange(last, parentEnd + 1, parentResult - 1);
        }

        // Sub-agent call ids are namespaced, so call_0 from two sub-agents can't collide.
        var subCalls = events.Where(e => Type(e) == "TOOL_CALL_START" && Str(e, "subagentRunId") is not null).ToList();
        Assert.Equal(4, subCalls.Count); // two builders x (searchExercises + writeDay)
        Assert.Equal(4, subCalls.Select(c => Str(c, "toolCallId")).Distinct().Count());
        Assert.All(subCalls, c => Assert.StartsWith(Str(c, "subagentRunId")! + "-", Str(c, "toolCallId")));

        // The builders' work overlapped (Mon wrote before Wed's last event, and vice versa).
        var mon = Str(started.First(s => Str(s, "description")!.Contains("Mon")), "subagentRunId");
        var wed = Str(started.First(s => Str(s, "description")!.Contains("Wed")), "subagentRunId");
        var monEvents = events.Select((e, i) => (e, i)).Where(x => Str(x.e, "subagentRunId") == mon).Select(x => x.i).ToList();
        var wedEvents = events.Select((e, i) => (e, i)).Where(x => Str(x.e, "subagentRunId") == wed).Select(x => x.i).ToList();
        Assert.True(monEvents.Min() < wedEvents.Max() && wedEvents.Min() < monEvents.Max(), "sub-agents did not overlap");

        // Writes stream as full state snapshots; the last one has both days.
        var snapshots = events.Where(e => Type(e) == "STATE_SNAPSHOT").Select(e => e.GetProperty("snapshot").Deserialize<ProgramState>(ContractJson.Options)!).ToList();
        Assert.Equal(3, snapshots.Count); // clientId/goal and empty columns first, then one per builder
        // The columns exist before the builders start, in weekday order, so finishing order can't reorder them.
        Assert.Equal([WeekDay.Mon, WeekDay.Wed], snapshots[0].Weeks[0].Days.Select(d => d.Name));
        Assert.All(snapshots[0].Weeks[0].Days, d => Assert.Empty(d.Exercises));
        var final = snapshots[^1];
        Assert.Equal([WeekDay.Mon, WeekDay.Wed], final.Weeks[0].Days.Select(d => d.Name));
        Assert.Empty(ProgramStateValidator.Validate(final));
        Assert.Equal("sarah", final.ClientId);
        Assert.Equal(Goal.Strength, final.Goal);
        Assert.Equal([WeekDay.Mon, WeekDay.Wed], final.Weeks[0].Days.Select(d => d.Name).Order());

        // The coach gets the reports back, with the risky lift found by the server, not the model.
        var result = JsonDocument.Parse(events[parentResult].GetProperty("content").GetString()!).RootElement;
        Assert.Equal(["overhead-press"], result.GetProperty("riskyLifts").EnumerateArray().Select(r => r.GetString()));
        var reports = result.GetProperty("reports").EnumerateArray().ToList();
        Assert.All(reports, r => Assert.Equal("done", r.GetProperty("status").GetString()));
        Assert.Contains(reports, r => r.GetProperty("summary").GetString() == "overhead-press -> landmine-press: high shoulder stress.");

        // Sub-agents only get searchExercises and their own scoped write tool, never runSubagents or updateProgram.
        var subRequests = chat.Requests.Where(r => r.Subagent is not null).ToList();
        Assert.All(subRequests, r => Assert.DoesNotContain(ToolNames.RunSubagents, r.Tools));
        Assert.All(subRequests, r => Assert.DoesNotContain(ToolNames.UpdateProgram, r.Tools));
        Assert.Contains(subRequests, r => r.Subagent!.EndsWith("|build-day:1:Wed") && r.Tools.Contains(ToolNames.WriteDay));
        Assert.Contains(subRequests, r => r.Subagent!.EndsWith("|injury-screen") && !r.Tools.Contains(ToolNames.WriteDay));
    }

    [Fact]
    public async Task With_the_toggle_off_the_coach_is_not_offered_runSubagents()
    {
        var chat = new SubagentScriptedChatClient(WeekOneTasks);
        await using var factory = CreateFactory(chat);
        var events = await Run(factory.CreateClient(), subagents: false, "thread-off");

        Assert.Equal("RUN_FINISHED", Type(events[^1]));
        Assert.DoesNotContain(events, e => Type(e).StartsWith("SUBAGENT_", StringComparison.Ordinal));
        var coach = Assert.Single(chat.Requests);
        Assert.Null(coach.Subagent);
        Assert.DoesNotContain(ToolNames.RunSubagents, coach.Tools);
    }

    [Theory]
    [InlineData("""[{ "kind": "build-day", "week": 1, "day": "Mon", "brief": "x" }]""", "need week, day and focus")]
    [InlineData("""[{ "kind": "build-day", "week": 1, "day": "Mon", "focus": "A", "brief": "x" }, { "kind": "build-day", "week": 1, "day": "Mon", "focus": "B", "brief": "y" }]""", "two tasks build week 1 Mon")]
    [InlineData("""[{ "kind": "build-week", "week": 2, "brief": "x" }]""", "Build week 1 first")]
    [InlineData("""[{ "kind": "injury-screen", "brief": "x" }, { "kind": "injury-screen", "brief": "y" }]""", "at most one injury-screen")]
    public void Bad_task_lists_are_rejected_with_a_fixable_message(string tasks, string expected)
    {
        var args = RunSubagentsTool.Parse(new AIFunctionArguments { ["tasks"] = JsonDocument.Parse(tasks).RootElement });
        var problem = RunSubagentsTool.Problem(args.Tasks, ProgramState.Empty("sarah"));
        Assert.NotNull(problem);
        Assert.Contains(expected, problem);
    }

    [Theory]
    [InlineData("""{ "enabled": true }""", true)]
    [InlineData("""{ "enabled": false }""", false)]
    [InlineData("on", false)]
    [InlineData("", false)]
    public void Toggle_is_read_from_the_agui_context(string value, bool expected)
    {
        var input = new AGUI.Abstractions.RunAgentInput
        {
            Context = [new AGUI.Abstractions.AGUIContext { Description = SubagentContext.Description, Value = value }],
        };
        Assert.Equal(expected, SubagentStreamAgent.IsEnabled(input));
    }
}

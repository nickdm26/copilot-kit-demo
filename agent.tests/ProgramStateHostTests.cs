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

namespace PtCoach.Agent.Tests;

/// <summary>Scripted model: calls updateProgram once per scripted step, then answers in text. Records what it was sent.</summary>
public sealed class ScriptedChatClient(params string[] updateProgramArgs) : IChatClient
{
    public ConcurrentQueue<List<ChatMessage>> Requests { get; } = new();

    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var list = messages.ToList();
        Requests.Enqueue(list);
        await Task.Yield();
        var step = list.SelectMany(m => m.Contents).OfType<FunctionResultContent>().Count();
        if (step < updateProgramArgs.Length)
        {
            var args = JsonSerializer.Deserialize<Dictionary<string, object?>>(updateProgramArgs[step]);
            yield return new ChatResponseUpdate(ChatRole.Assistant,
                [new FunctionCallContent($"call-{step}", ToolNames.UpdateProgram, args)]) { MessageId = $"m{step}" };
        }
        else
        {
            yield return new ChatResponseUpdate(ChatRole.Assistant, "Done.") { MessageId = "done" };
        }
    }

    public object? GetService(Type serviceType, object? serviceKey = null) => null;

    public void Dispose() { }
}

public sealed class ScriptedChatClientFactory(ScriptedChatClient client) : IChatClientFactory
{
    public IChatClient Create(string modelKey) => client;
}

public class ProgramStateHostTests
{
    private const string MonCall = """
        { "clientId": "sarah", "days": [ { "week": 1, "day": "Mon", "focus": "Lower",
          "exercises": [ { "exerciseId": "back-squat", "sets": 4, "reps": "5", "rpe": 7, "note": "" } ] } ] }
        """;

    private const string WedCall = """
        { "days": [ { "week": 1, "day": "Wed", "focus": "Upper",
          "exercises": [ { "exerciseId": "landmine-press", "sets": 3, "reps": "8-10", "rpe": 7.5, "note": "" } ] } ] }
        """;

    private const string BadCall = """{ "days": [ { "week": 1, "day": "Thu", "focus": "x", "exercises": [ { "exerciseId": "nope", "sets": 1, "reps": "5", "rpe": 7, "note": "" } ] } ] }""";

    // The trainer's edit: Fri with 9 sets of goblet squats.
    private static readonly object ClientState = new
    {
        clientId = "sarah",
        goal = "strength",
        daysPerWeek = 3,
        weeks = new[]
        {
            new { week = 1, days = new[] { new { day = "Fri", focus = "Trainer edit", exercises = new[] { new { exerciseId = "goblet-squat", sets = 9, reps = "10", rpe = 6, note = "" } } } } },
        },
        flags = Array.Empty<object>(),
    };

    private static WebApplicationFactory<Program> CreateFactory(ScriptedChatClient chat) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Development");
            b.UseSetting("OpenRouter:ApiKey", "unused");
            b.UseSetting("Seed:Directory", Path.Combine(AppContext.BaseDirectory, "Fixtures"));
            b.UseSetting("Models:quick:label", "Quick");
            b.UseSetting("Models:quick:modelId", "test/quick-model");
            b.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IChatClientFactory>(new ScriptedChatClientFactory(chat))));
        });

    private static async Task<List<JsonElement>> Run(HttpClient http, object state, string threadId)
    {
        var input = new
        {
            threadId,
            runId = "run-" + threadId,
            state,
            messages = new[] { new { id = "u1", role = "user", content = "Plan Sarah's week" } },
            tools = Array.Empty<object>(),
            context = Array.Empty<object>(),
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

    [Fact]
    public async Task UpdateProgram_results_stream_as_full_state_snapshots_built_on_client_state()
    {
        var chat = new ScriptedChatClient(MonCall, WedCall);
        await using var factory = CreateFactory(chat);
        var events = await Run(factory.CreateClient(), ClientState, "thread-a");

        Assert.Equal("RUN_FINISHED", Type(events[^1]));
        var snapshots = events.Where(e => Type(e) == "STATE_SNAPSHOT").Select(e => e.GetProperty("snapshot")).ToList();
        Assert.Equal(2, snapshots.Count);

        // Each snapshot is a full, valid ProgramState, and the second accumulates the first.
        var first = snapshots[0].Deserialize<ProgramState>(ContractJson.Options)!;
        var second = snapshots[1].Deserialize<ProgramState>(ContractJson.Options)!;
        Assert.Empty(ProgramStateValidator.Validate(second));
        Assert.Equal([WeekDay.Fri, WeekDay.Mon], first.Weeks[0].Days.Select(d => d.Name));
        Assert.Equal([WeekDay.Fri, WeekDay.Mon, WeekDay.Wed], second.Weeks[0].Days.Select(d => d.Name));
        Assert.Equal(9, second.Weeks[0].Days[0].Exercises[0].Sets); // the trainer edit survived

        // The model was shown the client state as a system message on the first request.
        var firstRequest = chat.Requests.First();
        var stateMessage = Assert.Single(firstRequest, m => m.Role == ChatRole.System && m.Text.StartsWith(ProgramStateAgent.StateMessagePrefix));
        Assert.Contains("\"sets\":9", stateMessage.Text);
        Assert.Contains("Trainer edit", stateMessage.Text);
    }

    [Fact]
    public async Task Invalid_call_sends_error_to_model_and_unchanged_state_to_client()
    {
        var chat = new ScriptedChatClient(MonCall, BadCall);
        await using var factory = CreateFactory(chat);
        var events = await Run(factory.CreateClient(), new { }, "thread-b");

        Assert.True(Type(events[^1]) == "RUN_FINISHED", events[^1].GetRawText());
        var snapshots = events.Where(e => Type(e) == "STATE_SNAPSHOT").Select(e => e.GetProperty("snapshot").GetRawText()).ToList();
        Assert.Equal(2, snapshots.Count);
        Assert.Equal(snapshots[0], snapshots[1]); // the rejected call changed nothing
        Assert.Contains("\"clientId\":\"sarah\"", snapshots[1]);
        var results = events.Where(e => Type(e) == "TOOL_CALL_RESULT").Select(e => e.GetRawText()).ToList();
        Assert.Equal(2, results.Count);
        Assert.All(results, r => Assert.DoesNotContain(UpdateProgramTool.ErrorPrefix, r));

        // The model saw the error text, so it can fix its call.
        var lastRequest = chat.Requests.Last();
        var error = lastRequest.SelectMany(m => m.Contents).OfType<FunctionResultContent>().Last();
        Assert.StartsWith(UpdateProgramTool.ErrorPrefix, error.Result?.ToString());
        Assert.Contains("nope", error.Result?.ToString());
    }

    [Fact]
    public async Task Concurrent_runs_do_not_share_state()
    {
        var chat = new ScriptedChatClient(MonCall);
        await using var factory = CreateFactory(chat);
        var http = factory.CreateClient();

        var withEdit = Run(http, ClientState, "thread-c");
        var empty = Run(http, new { }, "thread-d");
        await Task.WhenAll(withEdit, empty);

        static int Days(List<JsonElement> events) =>
            events.Single(e => Type(e) == "STATE_SNAPSHOT").GetProperty("snapshot").GetProperty("weeks")[0].GetProperty("days").GetArrayLength();
        Assert.Equal(2, Days(await withEdit)); // Fri (trainer) + Mon
        Assert.Equal(1, Days(await empty));    // Mon only
    }
}

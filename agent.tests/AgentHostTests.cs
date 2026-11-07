using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PtCoach.Agent.Chat;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.Tests;

public sealed class FakeChatClientFactory : IChatClientFactory
{
    public IChatClient Create(string modelKey) => new FakeChatClient();
}

public sealed class FakeChatClient : IChatClient
{
    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        Task.FromResult(new ChatResponse(new ChatMessage(ChatRole.Assistant, "Hello from the fake coach.")));

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        foreach (var word in new[] { "Hello ", "from ", "the ", "fake ", "coach." })
        {
            await Task.Yield();
            yield return new ChatResponseUpdate(ChatRole.Assistant, word) { MessageId = "m1" };
        }
    }

    public object? GetService(Type serviceType, object? serviceKey = null) => null;

    public void Dispose() { }
}

public class AgentHostTests
{
    private const string SecretKey = "sk-test-SECRET-do-not-leak";

    private static WebApplicationFactory<Program> CreateFactory(bool fakeChat) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Development");
            // UseSetting, not ConfigureAppConfiguration: Program reads "Models" eagerly from builder.Configuration.
            b.UseSetting("OpenRouter:ApiKey", SecretKey);
            b.UseSetting("Seed:Directory", Path.Combine(AppContext.BaseDirectory, "Fixtures"));
            b.UseSetting("Models:quick:label", "Quick");
            b.UseSetting("Models:quick:modelId", "test/quick-model");
            b.UseSetting("Models:thorough:label", "Thorough");
            b.UseSetting("Models:thorough:modelId", "test/thorough-model");
            if (fakeChat)
            {
                b.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IChatClientFactory, FakeChatClientFactory>()));
            }
        });

    [Fact]
    public async Task Models_endpoint_lists_models_and_no_secret()
    {
        await using var factory = CreateFactory(fakeChat: false);
        var http = factory.CreateClient();
        var response = await http.GetAsync("/models", TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.DoesNotContain(SecretKey, body);
        Assert.DoesNotContain("apiKey", body, StringComparison.OrdinalIgnoreCase);
        var models = JsonSerializer.Deserialize<List<ModelOption>>(body, ContractJson.Options)!;
        // appsettings.json models are merged in too, so check ours are present rather than the exact list.
        var quick = Assert.Single(models, m => m.Key == "quick");
        Assert.Equal("Quick", quick.Label);
        Assert.Equal("test/quick-model", quick.ModelId);
        Assert.Contains(models, m => m.Key == "thorough" && m.ModelId == "test/thorough-model");
        Assert.All(models, m => Assert.False(string.IsNullOrWhiteSpace(m.ModelId)));

        // appsettings.json order first (not alphabetical), then keys set only elsewhere.
        using var file = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "appsettings.json")));
        var fileOrder = file.RootElement.GetProperty("Models").EnumerateObject().Select(p => p.Name).ToList();
        Assert.Equal(fileOrder, models.Select(m => m.Key).Take(fileOrder.Count));
    }

    [Fact]
    public async Task App_starts_without_api_key_and_health_works()
    {
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
            b.UseSetting("OpenRouter:ApiKey", ""));
        var http = factory.CreateClient();
        Assert.True((await http.GetAsync("/health", TestContext.Current.CancellationToken)).IsSuccessStatusCode);
        Assert.True((await http.GetAsync("/models", TestContext.Current.CancellationToken)).IsSuccessStatusCode);
    }

    [Fact]
    public async Task Agent_endpoint_streams_ag_ui_events()
    {
        await using var factory = CreateFactory(fakeChat: true);
        var http = factory.CreateClient();

        var input = new
        {
            threadId = "thread-1",
            runId = "run-1",
            state = new { },
            messages = new[] { new { id = "u1", role = "user", content = "Hi coach" } },
            tools = Array.Empty<object>(),
            context = Array.Empty<object>(),
            forwardedProps = new { },
        };
        var request = new HttpRequestMessage(HttpMethod.Post, "/agent/quick")
        {
            Content = new StringContent(JsonSerializer.Serialize(input), Encoding.UTF8, "application/json"),
        };
        request.Headers.Accept.ParseAdd("text/event-stream");

        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseContentRead, TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.True(response.IsSuccessStatusCode, body);
        Assert.Contains("text/event-stream", response.Content.Headers.ContentType?.ToString());
        Assert.Contains("RUN_STARTED", body);
        Assert.Contains("TEXT_MESSAGE_CONTENT", body);
        Assert.Contains("RUN_FINISHED", body);
        Assert.DoesNotContain(SecretKey, body);
    }
}

using System.ClientModel;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using OpenAI;
using PtCoach.Agent.Models;
using PtCoach.Agent.Telemetry;

namespace PtCoach.Agent.Chat;

/// <summary>Maps a model key (a key of the "Models" config) to a chat client. Swap this in DI for fakes (tests, Phase 3 replay).</summary>
public interface IChatClientFactory
{
    IChatClient Create(string modelKey);
}

public sealed class OpenRouterOptions
{
    public string BaseUrl { get; set; } = "https://openrouter.ai/api/v1";

    /// <summary>User secrets only. Never logged, never returned from an endpoint.</summary>
    public string? ApiKey { get; set; }
}

public sealed class ModelsOptions
{
    /// <summary>Models in config order.</summary>
    public List<(string Key, ModelConfig Config)> Items { get; } = [];
}

public sealed class ReplayOptions
{
    /// <summary>The recording the <c>replay</c> model plays.</summary>
    public string Path { get; set; } = System.IO.Path.Combine(AppContext.BaseDirectory, "Replay", "demo-run.json");

    /// <summary>When set, live models record every turn here (one file per thread), to make a new replay recording.</summary>
    public string? RecordDirectory { get; set; }

    public int TextDelayMs { get; set; } = 15;
    public int CallDelayMs { get; set; } = 400;
}

/// <summary>Real factory: the OpenAI .NET client pointed at OpenRouter, with OpenTelemetry on the chat client.</summary>
public sealed class OpenRouterChatClientFactory(
    IOptions<OpenRouterOptions> openRouter,
    IOptions<ReplayOptions> replay,
    ModelsOptions models,
    ILoggerFactory loggerFactory,
    IOptions<TelemetryOptions> telemetry) : IChatClientFactory
{
    public const string TelemetrySource = "Experimental.Microsoft.Extensions.AI";

    public IChatClient Create(string modelKey)
    {
        var config = models.Items.FirstOrDefault(m => m.Key == modelKey).Config
            ?? throw new InvalidOperationException($"Unknown model key '{modelKey}'.");
        var r = replay.Value;
        if (modelKey == ModelKeys.Replay)
        {
            // No network call and no key needed.
            return ReplayChatClient.Load(r.Path, TimeSpan.FromMilliseconds(r.TextDelayMs), TimeSpan.FromMilliseconds(r.CallDelayMs))
                .AsBuilder()
                .UseOpenTelemetry(loggerFactory, TelemetrySource, c => c.EnableSensitiveData = telemetry.Value.CaptureContent)
                .Use((inner, _) => new TelemetryEnrichingChatClient(inner, telemetry.Value.CaptureContent))
                .Build();
        }

        var o = openRouter.Value;
        if (string.IsNullOrWhiteSpace(o.ApiKey))
        {
            const string message =
                "The OpenRouter API key is not configured. Set it with: dotnet user-secrets set \"OpenRouter:ApiKey\" \"<key>\" --project agent";
            // The AG-UI host turns exceptions into a generic RUN_ERROR, so log the real reason here.
            loggerFactory.CreateLogger<OpenRouterChatClientFactory>().LogError(message);
            throw new InvalidOperationException(message);
        }

        var client = new OpenAIClient(
            new ApiKeyCredential(o.ApiKey),
            // The 100s default cuts off long tool-call streams (a full 4-week build can take ~2 minutes).
            new OpenAIClientOptions { Endpoint = new Uri(o.BaseUrl), NetworkTimeout = TimeSpan.FromMinutes(5) });

        var chat = client.GetChatClient(config.ModelId).AsIChatClient();
        if (!string.IsNullOrWhiteSpace(r.RecordDirectory))
        {
            chat = new RecordingChatClient(chat, r.RecordDirectory);
        }

        return chat
            .AsBuilder()
            .UseOpenTelemetry(loggerFactory, TelemetrySource, c => c.EnableSensitiveData = telemetry.Value.CaptureContent)
            .Use((inner, _) => new TelemetryEnrichingChatClient(inner, telemetry.Value.CaptureContent))
            .Build();
    }
}

/// <summary>
/// Resolves the real client on first use, so the app starts without an API key and a run fails with a clear message.
/// </summary>
public sealed class LazyChatClient(IChatClientFactory factory, string modelKey) : IChatClient
{
    private readonly Lazy<IChatClient> _inner = new(() => factory.Create(modelKey), LazyThreadSafetyMode.PublicationOnly);

    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        _inner.Value.GetResponseAsync(messages, options, cancellationToken);

    public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        _inner.Value.GetStreamingResponseAsync(messages, options, cancellationToken);

    public object? GetService(Type serviceType, object? serviceKey = null) =>
        serviceKey is null && serviceType.IsInstanceOfType(this) ? this : null;

    public void Dispose()
    {
        if (_inner.IsValueCreated) _inner.Value.Dispose();
    }
}

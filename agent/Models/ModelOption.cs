namespace PtCoach.Agent.Models;

/// <summary>One entry of the "Models" allowlist in appsettings.json.</summary>
public sealed class ModelConfig
{
    public required string Label { get; init; }
    public required string ModelId { get; init; }
}

/// <summary>What GET /models returns per key. Never includes secrets.</summary>
public sealed record ModelOption(string Key, string Label, string ModelId);

public static class ModelKeys
{
    /// <summary>Reserved key backed by a recorded run (Phase 3). Not an OpenRouter model.</summary>
    public const string Replay = "replay";
}

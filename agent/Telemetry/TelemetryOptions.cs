namespace PtCoach.Agent.Telemetry;

/// <summary>Configuration for PT Coach OpenTelemetry.</summary>
public sealed class TelemetryOptions
{
    public const string SectionName = "Telemetry";

    /// <summary>
    /// When true, captures LLM prompt and response text on GenAI spans.
    /// Off by default for privacy: never record client names, injury notes, or conversation text.
    /// Maps to <c>OpenTelemetryChatClient.EnableSensitiveData</c>.
    /// </summary>
    public bool CaptureContent { get; set; }
}

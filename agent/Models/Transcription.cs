namespace PtCoach.Agent.Models;

/// <summary>The "Transcription" block of appsettings.json: which OpenRouter speech-to-text model the mic button uses.</summary>
public sealed class TranscriptionOptions
{
    public const string SectionName = "Transcription";

    public string ModelId { get; set; } = "openai/whisper-large-v3";
}

/// <summary>What POST /transcribe returns on success.</summary>
public sealed record TranscriptionResult(string Text);

/// <summary>What POST /transcribe returns on failure. The runtime passes <c>Error</c> on to CopilotKit.</summary>
public sealed record TranscriptionError(string Error);

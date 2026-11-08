using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.Chat;

/// <summary>
/// POST /transcribe: takes a multipart <c>audio</c> file (the chat's mic recording, sent on by the runtime) and returns
/// <see cref="TranscriptionResult"/>. Calls OpenRouter's /audio/transcriptions here because the API key lives only in
/// the agent.
/// </summary>
public static class TranscriptionEndpoint
{
    public const string HttpClientName = "openrouter-transcription";

    /// <summary>OpenRouter rejects inline audio over 25 MB on most providers.</summary>
    public const long MaxAudioBytes = 25 * 1024 * 1024;

    public static async Task<IResult> Handle(
        HttpRequest request,
        IHttpClientFactory httpClients,
        IOptions<OpenRouterOptions> openRouter,
        IOptions<TranscriptionOptions> transcription,
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        var log = loggerFactory.CreateLogger(typeof(TranscriptionEndpoint));
        if (!request.HasFormContentType)
        {
            return Fail(HttpStatusCode.BadRequest, "Send the recording as multipart/form-data with an 'audio' field.");
        }

        var form = await request.ReadFormAsync(ct);
        var audio = form.Files["audio"];
        if (audio is null || audio.Length == 0)
        {
            return Fail(HttpStatusCode.BadRequest, "No audio: include a non-empty 'audio' file.");
        }
        if (audio.Length > MaxAudioBytes)
        {
            // "too long" is what CopilotKit looks for to show its "Recording is too long" message.
            return Fail(HttpStatusCode.BadRequest, "Recording is too long (over 25 MB).");
        }
        var format = AudioFormat(audio.ContentType, audio.FileName);
        if (format is null)
        {
            return Fail(HttpStatusCode.BadRequest, $"Unsupported audio format '{audio.ContentType}'.");
        }

        var o = openRouter.Value;
        if (string.IsNullOrWhiteSpace(o.ApiKey))
        {
            // "API key" makes CopilotKit show its auth-error message rather than a generic retry prompt.
            return Fail(HttpStatusCode.ServiceUnavailable, "No OpenRouter API key: set OpenRouter:ApiKey in the agent's user secrets.");
        }

        byte[] bytes;
        using (var buffer = new MemoryStream((int)audio.Length))
        {
            await audio.CopyToAsync(buffer, ct);
            bytes = buffer.ToArray();
        }

        var modelId = transcription.Value.ModelId;
        using var upstream = new HttpRequestMessage(HttpMethod.Post, $"{o.BaseUrl.TrimEnd('/')}/audio/transcriptions")
        {
            Content = JsonContent.Create(new
            {
                model = modelId,
                input_audio = new { data = Convert.ToBase64String(bytes), format },
            }),
        };
        upstream.Headers.Authorization = new AuthenticationHeaderValue("Bearer", o.ApiKey);

        HttpResponseMessage response;
        try
        {
            response = await httpClients.CreateClient(HttpClientName).SendAsync(upstream, ct);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            log.LogWarning("Transcription request to OpenRouter failed: {Error}", e.Message);
            return Fail(HttpStatusCode.BadGateway, "Network error reaching OpenRouter.");
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                var message = UpstreamErrorMessage(body);
                var status = (int)response.StatusCode;
                log.LogWarning("OpenRouter transcription with {Model} returned {Status}: {Message}", modelId, status, message);
                // The status goes into the message too: CopilotKit picks its user-facing error by matching "429", "401" etc.
                return status switch
                {
                    429 => Fail(HttpStatusCode.TooManyRequests, $"OpenRouter rate limit (429): {message}"),
                    401 or 403 => Fail(HttpStatusCode.Unauthorized, $"OpenRouter rejected the API key ({status}): {message}"),
                    400 or 413 or 415 or 422 => Fail(HttpStatusCode.BadRequest, $"OpenRouter could not transcribe the audio ({status}): {message}"),
                    _ => Fail(HttpStatusCode.BadGateway, $"OpenRouter error ({status}): {message}"),
                };
            }

            string? text;
            try
            {
                using var json = JsonDocument.Parse(body);
                text = json.RootElement.TryGetProperty("text", out var t) ? t.GetString() : null;
                if (json.RootElement.TryGetProperty("usage", out var usage))
                {
                    log.LogInformation("Transcribed {Seconds}s of audio with {Model} (cost {Cost})",
                        usage.TryGetProperty("seconds", out var s) ? s.ToString() : "?", modelId,
                        usage.TryGetProperty("cost", out var c) ? c.ToString() : "?");
                }
            }
            catch (JsonException)
            {
                text = null;
            }
            if (text is null)
            {
                return Fail(HttpStatusCode.BadGateway, "OpenRouter returned no transcript.");
            }
            // Whisper can leave double spaces between segments.
            var clean = System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ").Trim();
            return Results.Json(new TranscriptionResult(clean), ContractJson.Options);
        }
    }

    /// <summary>OpenRouter's <c>input_audio.format</c> for a recording, from its MIME type (or file extension).</summary>
    public static string? AudioFormat(string? contentType, string? fileName)
    {
        var mime = (contentType ?? "").Split(';')[0].Trim().ToLowerInvariant();
        var fromMime = mime switch
        {
            "audio/webm" or "video/webm" => "webm",
            "audio/ogg" => "ogg",
            "audio/mp4" or "audio/x-m4a" or "audio/m4a" => "m4a", // Safari's MediaRecorder records audio/mp4
            "audio/mpeg" or "audio/mp3" => "mp3",
            "audio/wav" or "audio/x-wav" or "audio/wave" => "wav",
            "audio/flac" => "flac",
            "audio/aac" => "aac",
            _ => null,
        };
        if (fromMime is not null)
        {
            return fromMime;
        }
        var ext = Path.GetExtension(fileName ?? "").TrimStart('.').ToLowerInvariant();
        return ext is "webm" or "ogg" or "m4a" or "mp3" or "wav" or "flac" or "aac" ? ext : null;
    }

    private static IResult Fail(HttpStatusCode status, string error) =>
        Results.Json(new TranscriptionError(error), ContractJson.Options, statusCode: (int)status);

    /// <summary>OpenRouter errors look like <c>{"error":{"message":"..."}}</c>; fall back to the start of the raw body.</summary>
    private static string UpstreamErrorMessage(string body)
    {
        try
        {
            using var json = JsonDocument.Parse(body);
            if (json.RootElement.TryGetProperty("error", out var e))
            {
                if (e.ValueKind == JsonValueKind.String)
                {
                    return e.GetString() ?? "";
                }
                if (e.ValueKind == JsonValueKind.Object && e.TryGetProperty("message", out var m))
                {
                    return m.GetString() ?? "";
                }
            }
        }
        catch (JsonException)
        {
        }
        return body.Length > 300 ? body[..300] : body;
    }
}

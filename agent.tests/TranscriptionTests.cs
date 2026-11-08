using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using PtCoach.Agent.Chat;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.Tests;

/// <summary>Stands in for OpenRouter: records the request and returns a canned response.</summary>
public sealed class FakeOpenRouterHandler(HttpStatusCode status, string body) : HttpMessageHandler
{
    public HttpRequestMessage? Request { get; private set; }
    public string? RequestBody { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Request = request;
        RequestBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        return new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }
}

public class TranscriptionTests
{
    private const string SecretKey = "sk-test-SECRET-do-not-leak";
    private static readonly byte[] Audio = Encoding.ASCII.GetBytes("fake-webm-bytes");

    private static WebApplicationFactory<Program> CreateFactory(FakeOpenRouterHandler upstream, string? apiKey = SecretKey) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Development");
            b.UseSetting("OpenRouter:ApiKey", apiKey ?? "");
            b.UseSetting("OpenRouter:BaseUrl", "https://openrouter.test/api/v1/");
            b.UseSetting("Transcription:modelId", "test/whisper");
            b.UseSetting("Seed:Directory", Path.Combine(AppContext.BaseDirectory, "Fixtures"));
            b.ConfigureServices(s => s.Configure<HttpClientFactoryOptions>(TranscriptionEndpoint.HttpClientName,
                o => o.HttpMessageHandlerBuilderActions.Add(h => h.PrimaryHandler = upstream)));
        });

    private static MultipartFormDataContent Recording(string mime = "audio/webm;codecs=opus", byte[]? bytes = null)
    {
        var file = new ByteArrayContent(bytes ?? Audio);
        file.Headers.ContentType = MediaTypeHeaderValue.Parse(mime);
        return new MultipartFormDataContent { { file, "audio", "recording.webm" } };
    }

    [Fact]
    public async Task Sends_the_recording_to_OpenRouter_and_returns_the_text()
    {
        var upstream = new FakeOpenRouterHandler(HttpStatusCode.OK,
            """{"text":"  Swap Thursday's squats  for leg press. ","usage":{"seconds":3.2,"cost":0.00002}}""");
        await using var factory = CreateFactory(upstream);
        var response = await factory.CreateClient().PostAsync("/transcribe", Recording(), TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Swap Thursday's squats for leg press.", JsonSerializer.Deserialize<TranscriptionResult>(body, ContractJson.Options)!.Text);
        Assert.DoesNotContain(SecretKey, body);

        Assert.Equal(HttpMethod.Post, upstream.Request!.Method);
        Assert.Equal("https://openrouter.test/api/v1/audio/transcriptions", upstream.Request.RequestUri!.ToString());
        Assert.Equal("Bearer", upstream.Request.Headers.Authorization!.Scheme);
        Assert.Equal(SecretKey, upstream.Request.Headers.Authorization.Parameter);
        using var sent = JsonDocument.Parse(upstream.RequestBody!);
        Assert.Equal("test/whisper", sent.RootElement.GetProperty("model").GetString());
        var inputAudio = sent.RootElement.GetProperty("input_audio");
        Assert.Equal("webm", inputAudio.GetProperty("format").GetString());
        Assert.Equal(Convert.ToBase64String(Audio), inputAudio.GetProperty("data").GetString());
    }

    [Fact]
    public async Task Without_an_api_key_it_fails_without_calling_OpenRouter()
    {
        var upstream = new FakeOpenRouterHandler(HttpStatusCode.OK, """{"text":"unused"}""");
        await using var factory = CreateFactory(upstream, apiKey: null);
        var response = await factory.CreateClient().PostAsync("/transcribe", Recording(), TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("API key", JsonSerializer.Deserialize<TranscriptionError>(body, ContractJson.Options)!.Error);
        Assert.Null(upstream.Request);
    }

    [Fact]
    public async Task Rejects_a_missing_or_unsupported_recording()
    {
        var upstream = new FakeOpenRouterHandler(HttpStatusCode.OK, """{"text":"unused"}""");
        await using var factory = CreateFactory(upstream);
        var http = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var empty = await http.PostAsync("/transcribe", Recording(bytes: []), ct);
        var notAudio = await http.PostAsync("/transcribe", new MultipartFormDataContent
        {
            { new ByteArrayContent(Audio) { Headers = { ContentType = new MediaTypeHeaderValue("text/plain") } }, "audio", "notes.txt" },
        }, ct);
        var notMultipart = await http.PostAsync("/transcribe", new StringContent("{}", Encoding.UTF8, "application/json"), ct);

        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, notAudio.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, notMultipart.StatusCode);
        Assert.Null(upstream.Request);
    }

    [Theory]
    [InlineData(HttpStatusCode.TooManyRequests, HttpStatusCode.TooManyRequests, "429")]
    [InlineData(HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, "401")]
    [InlineData(HttpStatusCode.BadRequest, HttpStatusCode.BadRequest, "400")]
    public async Task Passes_OpenRouter_errors_on_with_the_status_in_the_message(HttpStatusCode upstreamStatus, HttpStatusCode expected, string inMessage)
    {
        var upstream = new FakeOpenRouterHandler(upstreamStatus, """{"error":{"message":"upstream said no","code":1}}""");
        await using var factory = CreateFactory(upstream);
        var response = await factory.CreateClient().PostAsync("/transcribe", Recording(), TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(expected, response.StatusCode);
        var error = JsonSerializer.Deserialize<TranscriptionError>(body, ContractJson.Options)!.Error;
        Assert.Contains(inMessage, error);
        Assert.Contains("upstream said no", error);
        Assert.DoesNotContain(SecretKey, body);
    }

    [Theory]
    [InlineData("audio/webm;codecs=opus", "recording.webm", "webm")]
    [InlineData("audio/mp4", "recording.mp4", "m4a")]
    [InlineData("audio/ogg; codecs=opus", "recording.ogg", "ogg")]
    [InlineData("application/octet-stream", "clip.wav", "wav")]
    [InlineData("text/plain", "notes.txt", null)]
    public void Maps_recording_types_to_OpenRouter_formats(string mime, string fileName, string? expected) =>
        Assert.Equal(expected, TranscriptionEndpoint.AudioFormat(mime, fileName));
}

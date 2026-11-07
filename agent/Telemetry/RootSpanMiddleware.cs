using System.Diagnostics;
using System.Text.Json;

namespace PtCoach.Agent.Telemetry;

/// <summary>
/// Middleware that starts a root span for each AG-UI agent run request, capturing the run id, thread id, and
/// client id (when available from the request body). Runs only on /agent/* paths.
/// </summary>
public sealed class RootSpanMiddleware(RequestDelegate next)
{
    private static readonly ActivitySource Activity = AgentTelemetry.Activity;

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";
        if (!path.StartsWith("/agent/", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        // Read the body once, capturing it for downstream middleware.
        context.Request.EnableBuffering();
        string body;
        using (var reader = new StreamReader(context.Request.Body, leaveOpen: true))
        {
            body = await reader.ReadToEndAsync();
        }
        context.Request.Body.Position = 0;

        string? runId = null;
        string? threadId = null;
        string? clientId = null;

        if (!string.IsNullOrWhiteSpace(body))
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (root.TryGetProperty("runId", out var r)) runId = r.GetString();
                if (root.TryGetProperty("threadId", out var t)) threadId = t.GetString();
                // Client id is in state.clientId when present.
                if (root.TryGetProperty("state", out var state) && state.TryGetProperty("clientId", out var c)) clientId = c.GetString();
            }
            catch (JsonException)
            {
                // Body not JSON; let downstream middleware handle it.
            }
        }

        using var activity = Activity.StartActivity("agui.run", ActivityKind.Server);
        if (activity is not null)
        {
            if (runId is not null) activity.SetTag(AgentTelemetry.AttrRunId, runId);
            if (threadId is not null) activity.SetTag(AgentTelemetry.AttrThreadId, threadId);
            if (clientId is not null) activity.SetTag(AgentTelemetry.AttrClientId, clientId);
        }

        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            activity?.AddException(ex);
            throw;
        }

        if (activity is not null && context.Response.StatusCode >= 500)
        {
            activity.SetStatus(ActivityStatusCode.Error, $"HTTP {context.Response.StatusCode}");
        }
    }
}

using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.Telemetry;

/// <summary>
/// A <see cref="DelegatingChatClient"/> that enriches OpenTelemetry spans with PT Coach-specific events:
/// approval proposals and decisions, program cell changes, and error recording.
/// Does not capture prompt or response text, or a swap's free-text reason (it can name an injury),
/// unless <paramref name="captureContent"/> is on (<see cref="TelemetryOptions.CaptureContent"/>, off by default).
/// </summary>
public sealed class TelemetryEnrichingChatClient(IChatClient inner, bool captureContent = false) : DelegatingChatClient(inner)
{
    // One client serves every run for its model, so runs can touch this set at the same time.
    private readonly ConcurrentDictionary<string, byte> _proposeSwapCallIds = new();

    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        // Scan incoming messages for proposeSwap results from previous turns.
        foreach (var msg in messages)
        {
            foreach (var content in msg.Contents)
            {
                if (content is FunctionResultContent frc && _proposeSwapCallIds.ContainsKey(frc.CallId))
                {
                    RecordApprovalDecision(frc);
                }
            }
        }

        // Enumerate by hand: C# can't yield inside a try with a catch, and errors (e.g. OpenRouter timeouts) surface here.
        await using var updates = base.GetStreamingResponseAsync(messages, options, cancellationToken)
            .GetAsyncEnumerator(cancellationToken);
        while (true)
        {
            ChatResponseUpdate update;
            try
            {
                if (!await updates.MoveNextAsync()) break;
                update = updates.Current;
            }
            catch (Exception ex) when (!(ex is OperationCanceledException && cancellationToken.IsCancellationRequested))
            {
                RecordError(ex);
                throw;
            }

            foreach (var content in update.Contents)
            {
                if (content is FunctionCallContent fcc && fcc.Name == ToolNames.ProposeSwap)
                {
                    _proposeSwapCallIds.TryAdd(fcc.CallId, 0);
                    RecordApprovalProposed(fcc);
                }
                else if (content is FunctionCallContent fcc2 && fcc2.Name == ToolNames.UpdateProgram)
                {
                    RecordUpdateProgramCall(fcc2);
                }
            }
            yield return update;
        }
    }

    public override async Task<ChatResponse> GetResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await base.GetResponseAsync(messages, options, cancellationToken);

            // Check response messages for tool calls.
            foreach (var msg in response.Messages)
            {
                foreach (var content in msg.Contents)
                {
                    if (content is FunctionCallContent fcc && fcc.Name == ToolNames.ProposeSwap)
                    {
                        _proposeSwapCallIds.TryAdd(fcc.CallId, 0);
                        RecordApprovalProposed(fcc);
                    }
                    else if (content is FunctionCallContent fcc2 && fcc2.Name == ToolNames.UpdateProgram)
                    {
                        RecordUpdateProgramCall(fcc2);
                    }
                    else if (content is FunctionResultContent frc && _proposeSwapCallIds.ContainsKey(frc.CallId))
                    {
                        RecordApprovalDecision(frc);
                    }
                }
            }
            return response;
        }
        catch (Exception ex) when (!(ex is OperationCanceledException && cancellationToken.IsCancellationRequested))
        {
            RecordError(ex);
            throw;
        }
    }

    private void RecordApprovalProposed(FunctionCallContent call)
    {
        var activity = Activity.Current;
        if (activity is null) return;

        var args = call.Arguments;
        var tags = new ActivityTagsCollection
        {
            [AgentTelemetry.AttrApprovalTool] = ToolNames.ProposeSwap,
            [AgentTelemetry.AttrApprovalFromExercise] = GetStringArg(args, "fromExerciseId"),
            [AgentTelemetry.AttrApprovalToExercise] = GetStringArg(args, "toExerciseId"),
        };
        // The reason is model-written text such as "left shoulder impingement": health data, so opt-in only.
        if (captureContent) tags[AgentTelemetry.AttrApprovalReason] = GetStringArg(args, "reason");
        activity.AddEvent(new ActivityEvent(AgentTelemetry.EventApprovalProposed, tags: tags));
    }

    private static void RecordApprovalDecision(FunctionResultContent result)
    {
        var activity = Activity.Current;
        if (activity is null) return;

        string status;
        if (result.Result is JsonElement je)
        {
            // Never throw from telemetry: the result may not be an object, or "approved" may not be a boolean.
            status = je.ValueKind == JsonValueKind.Object
                && je.TryGetProperty("approved", out var approved)
                && approved.ValueKind == JsonValueKind.True
                ? "approved" : "rejected";
        }
        else if (result.Result is string s)
        {
            status = s;
        }
        else
        {
            status = "unknown";
        }

        activity.AddEvent(new ActivityEvent(
            AgentTelemetry.EventApprovalDecision,
            tags: new ActivityTagsCollection
            {
                [AgentTelemetry.AttrApprovalStatus] = status,
                [AgentTelemetry.AttrApprovalTool] = ToolNames.ProposeSwap,
            }));
    }

    private static void RecordUpdateProgramCall(FunctionCallContent call)
    {
        var activity = Activity.Current;
        if (activity is null) return;

        var args = call.Arguments;
        var days = GetListCount(args, "days");
        var removeDays = GetListCount(args, "removeDays");
        var cellsChanged = days + removeDays;

        activity.SetTag(AgentTelemetry.AttrCellsChanged, cellsChanged);
    }

    private static void RecordError(Exception ex)
    {
        var activity = Activity.Current;
        if (activity is null) return;

        activity.SetStatus(ActivityStatusCode.Error, ex.Message);
        activity.AddException(ex);
    }

    private static string? GetStringArg(IDictionary<string, object?>? args, string key)
    {
        if (args is null) return null;
        if (args.TryGetValue(key, out var val) && val is string s) return s;
        return null;
    }

    private static int GetListCount(IDictionary<string, object?>? args, string key)
    {
        if (args is null) return 0;
        if (args.TryGetValue(key, out var val) && val is JsonElement je && je.ValueKind == JsonValueKind.Array)
        {
            return je.GetArrayLength();
        }
        return 0;
    }
}

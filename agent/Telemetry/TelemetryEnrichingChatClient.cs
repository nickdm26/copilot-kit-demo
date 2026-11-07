using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.Telemetry;

/// <summary>
/// A <see cref="DelegatingChatClient"/> that enriches OpenTelemetry spans with PT Coach-specific events:
/// approval proposals and decisions, program cell changes, and error recording.
/// Does not capture prompt or response text (privacy).
/// </summary>
public sealed class TelemetryEnrichingChatClient(IChatClient inner) : DelegatingChatClient(inner)
{
    private readonly HashSet<string> _proposeSwapCallIds = [];

    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        // Scan incoming messages for proposeSwap results from previous turns.
        foreach (var msg in messages)
        {
            foreach (var content in msg.Contents)
            {
                if (content is FunctionResultContent frc && _proposeSwapCallIds.Contains(frc.CallId))
                {
                    RecordApprovalDecision(frc);
                }
            }
        }

        var updates = new List<ChatResponseUpdate>();
        await foreach (var update in base.GetStreamingResponseAsync(messages, options, cancellationToken))
        {
            updates.Add(update);
            foreach (var content in update.Contents)
            {
                if (content is FunctionCallContent fcc && fcc.Name == ToolNames.ProposeSwap)
                {
                    _proposeSwapCallIds.Add(fcc.CallId);
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
                        _proposeSwapCallIds.Add(fcc.CallId);
                        RecordApprovalProposed(fcc);
                    }
                    else if (content is FunctionCallContent fcc2 && fcc2.Name == ToolNames.UpdateProgram)
                    {
                        RecordUpdateProgramCall(fcc2);
                    }
                    else if (content is FunctionResultContent frc && _proposeSwapCallIds.Contains(frc.CallId))
                    {
                        RecordApprovalDecision(frc);
                    }
                }
            }
            return response;
        }
        catch (Exception ex)
        {
            RecordError(ex);
            throw;
        }
    }

    private static void RecordApprovalProposed(FunctionCallContent call)
    {
        var activity = Activity.Current;
        if (activity is null) return;

        var args = call.Arguments;
        activity.AddEvent(new ActivityEvent(
            AgentTelemetry.EventApprovalProposed,
            tags: new ActivityTagsCollection
            {
                [AgentTelemetry.AttrApprovalTool] = ToolNames.ProposeSwap,
                [AgentTelemetry.AttrApprovalFromExercise] = GetStringArg(args, "fromExerciseId"),
                [AgentTelemetry.AttrApprovalToExercise] = GetStringArg(args, "toExerciseId"),
                [AgentTelemetry.AttrApprovalReason] = GetStringArg(args, "reason"),
            }));
    }

    private static void RecordApprovalDecision(FunctionResultContent result)
    {
        var activity = Activity.Current;
        if (activity is null) return;

        string status;
        if (result.Result is JsonElement je)
        {
            status = je.TryGetProperty("approved", out var approved) && approved.GetBoolean()
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

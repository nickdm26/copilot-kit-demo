using System.Diagnostics;

namespace PtCoach.Agent.Telemetry;

/// <summary>Activity sources and span helpers for PT Coach OpenTelemetry.</summary>
public static class AgentTelemetry
{
    /// <summary>Source for custom PT Coach spans.</summary>
    public static readonly ActivitySource Activity = new("PtCoach.Agent", "1.0.0");

    // Semantic convention attribute names for GenAI / AG-UI.

    /// <summary>AG-UI run id.</summary>
    public const string AttrRunId = "agui.run_id";

    /// <summary>AG-UI thread id.</summary>
    public const string AttrThreadId = "agui.thread_id";

    /// <summary>Client id from the program state, set when known.</summary>
    public const string AttrClientId = "agui.client_id";

    /// <summary>Number of program cells changed in an updateProgram call.</summary>
    public const string AttrCellsChanged = "program.cells_changed";

    /// <summary>Approval outcome: "proposed", "approved", "rejected".</summary>
    public const string AttrApprovalStatus = "approval.status";

    /// <summary>Tool name involved in the approval.</summary>
    public const string AttrApprovalTool = "approval.tool_name";

    /// <summary>The exercise id being swapped from.</summary>
    public const string AttrApprovalFromExercise = "approval.from_exercise";

    /// <summary>The exercise id being swapped to.</summary>
    public const string AttrApprovalToExercise = "approval.to_exercise";

    /// <summary>Reason for the swap proposal.</summary>
    public const string AttrApprovalReason = "approval.reason";

    /// <summary>Span event name for an approval proposal.</summary>
    public const string EventApprovalProposed = "approval.proposed";

    /// <summary>Span event name for an approval decision.</summary>
    public const string EventApprovalDecision = "approval.decision";
}

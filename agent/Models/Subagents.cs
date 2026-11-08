using System.Text.Json.Serialization;

namespace PtCoach.Agent.Models;

// Parallel sub-agents (CONTRACTS section 11). Matches RunSubagentsArgsSchema and SUBAGENTS in web/src/lib/contracts.ts.

[JsonConverter(typeof(JsonStringEnumConverter<SubagentKind>))]
public enum SubagentKind
{
    /// <summary>Builds one day (week, day, focus) and writes it to the grid.</summary>
    [JsonStringEnumMemberName("build-day")] BuildDay,

    /// <summary>Builds one later week from week 1 and writes it to the grid.</summary>
    [JsonStringEnumMemberName("build-week")] BuildWeek,

    /// <summary>Read-only: lists the lifts that are risky for the client's injuries, with safer alternatives.</summary>
    [JsonStringEnumMemberName("injury-screen")] InjuryScreen,
}

public static class SubagentLimits
{
    public const int MaxTasks = 7;
    public const int MaxBriefLength = 400;

    /// <summary>One sub-agent gets this long before it is stopped and reported as an error.</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromMinutes(3);
}

/// <summary>The AG-UI context entry the web app sends with the header toggle (useAgentContext).</summary>
public static class SubagentContext
{
    public const string Description = "Parallel sub-agents";
}

/// <summary>
/// One delegated task. build-day needs Week, Day and Focus; build-week needs Week (2 or later);
/// injury-screen needs neither.
/// </summary>
public sealed record SubagentTask(
    SubagentKind Kind,
    string Brief,
    int? Week = null,
    WeekDay? Day = null,
    string? Focus = null);

/// <summary>Arguments of runSubagents. ClientId, Goal and DaysPerWeek are applied to the program before the fan-out.</summary>
public sealed record RunSubagentsArgs(
    IReadOnlyList<SubagentTask> Tasks,
    string? ClientId = null,
    Goal? Goal = null,
    int? DaysPerWeek = null);

/// <summary>writeDay: the day builder's only write tool, scoped to its own (week, day).</summary>
public sealed record WriteDayArgs(string Focus, IReadOnlyList<ExerciseEntry> Exercises);

/// <summary>writeWeek: the week builder's only write tool, scoped to its own week.</summary>
public sealed record WriteWeekArgs(IReadOnlyList<WriteWeekDay> Days);

public sealed record WriteWeekDay(WeekDay Day, string Focus, IReadOnlyList<ExerciseEntry> Exercises);

/// <summary>What one sub-agent hands back: in SUBAGENT_FINISHED.result and in the runSubagents result.</summary>
public sealed record SubagentReport(
    string SubagentRunId,
    SubagentKind Kind,
    string Title,
    string Status,
    string Summary,
    int? Week = null,
    WeekDay? Day = null,
    IReadOnlyList<string>? Wrote = null,
    IReadOnlyList<string>? RiskyLifts = null,
    long DurationMs = 0,
    long? InputTokens = null,
    long? OutputTokens = null);

public static class SubagentStatus
{
    public const string Done = "done";
    public const string Error = "error";
}

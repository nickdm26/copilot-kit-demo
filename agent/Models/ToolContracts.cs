namespace PtCoach.Agent.Models;

// Tool names and argument shapes. Matches the TOOLS table in CONTRACTS.md
// and the *ArgsSchema definitions in web/src/lib/contracts.ts.

public static class ToolNames
{
    public const string GetClient = "getClient";
    public const string SearchExercises = "searchExercises";
    public const string UpdateProgram = "updateProgram";
    public const string ShowExerciseCard = "showExerciseCard";
    public const string ShowWeekSummary = "showWeekSummary";
        public const string ShowProgressCard = "showProgressCard";
        public const string ProposeSwap = "proposeSwap";
    public const string ProposeChanges = "proposeChanges";
}

public sealed record GetClientArgs(string ClientId);

/// <summary>All filters optional, combined with AND. Returns at most 10 exercises.</summary>
public sealed record SearchExercisesArgs(
    string? Query = null,
    Pattern? Pattern = null,
    Muscle? Muscle = null,
    Equipment? Equipment = null,
    ShoulderStress? MaxShoulderStress = null);

/// <summary>
/// Days are upserted on (week, day). RemoveDays deletes on (week, day).
/// Flags, when present, replace the whole list. Returns the full ProgramState.
/// </summary>
public sealed record UpdateProgramArgs(
    string? ClientId = null,
    Goal? Goal = null,
    int? DaysPerWeek = null,
    IReadOnlyList<ProgramDayUpsert>? Days = null,
    IReadOnlyList<DayRef>? RemoveDays = null,
    IReadOnlyList<Flag>? Flags = null);

public sealed record ProgramDayUpsert(int Week, WeekDay Day, string Focus, IReadOnlyList<ExerciseEntry> Exercises);

public sealed record DayRef(int Week, WeekDay Day);

public sealed record ShowExerciseCardArgs(
    string ExerciseId,
    int Sets,
    string Reps,
    double Rpe,
    int? Week = null,
    WeekDay? Day = null,
    string? Note = null);

public sealed record ShowWeekSummaryArgs(int Week, string? Note = null);

public sealed record ShowProgressCardArgs(
    string Lift,
    IReadOnlyList<ProgressPoint> Points,
    string TopSet,
    double Est1rm,
    double? Goal = null,
    ProgressTrend? Trend = null);

public sealed record ProgressPoint(int Week, double Kg);

public sealed record ProgressTrend(string Tone, string Label);

/// <summary>When Week and Day are both null the swap applies to every occurrence.</summary>
public sealed record ProposeSwapArgs(
    string FromExerciseId,
    string ToExerciseId,
    string Reason,
    int? Week = null,
    WeekDay? Day = null);

public sealed record ProposeSwapResult(bool Approved, string FromExerciseId, string ToExerciseId);

public sealed record ProposeChangesArgs(int Week, IReadOnlyList<DiffRow> Rows, string? Reason = null);

public sealed record DiffRow(string Cell, string Before, string After);

public sealed record ProposeChangesResult(bool Approved);

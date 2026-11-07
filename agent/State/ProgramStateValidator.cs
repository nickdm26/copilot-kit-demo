using System.Text.RegularExpressions;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.State;

/// <summary>
/// Checks a <see cref="ProgramState"/> against the rules of CONTRACTS.md section 1 (and shared/program.schema.json).
/// Used for the untrusted client state and for every updateProgram result.
/// </summary>
public static partial class ProgramStateValidator
{
    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$")]
    private static partial Regex IdPattern();

    [GeneratedRegex("^[0-9]{1,2}(-[0-9]{1,2}|s)?$")]
    private static partial Regex RepsPattern();

    /// <param name="knownExerciseIds">Seed exercise ids; null skips the check.</param>
    /// <param name="knownClientIds">Seed client ids; null skips the check.</param>
    /// <returns>Human-readable problems (empty when valid). Phrased so a model can fix its call.</returns>
    public static List<string> Validate(
        ProgramState? state,
        IReadOnlySet<string>? knownExerciseIds = null,
        IReadOnlySet<string>? knownClientIds = null)
    {
        var errors = new List<string>();
        if (state is null)
        {
            errors.Add("state is null");
            return errors;
        }

        if (string.IsNullOrEmpty(state.ClientId)) errors.Add("clientId is required (pass clientId, e.g. \"sarah\")");
        else if (!IsId(state.ClientId)) errors.Add($"clientId '{state.ClientId}' must be a kebab-case id");
        else if (knownClientIds is not null && !knownClientIds.Contains(state.ClientId)) errors.Add($"clientId '{state.ClientId}' is not a known client");

        if (!Enum.IsDefined(state.Goal)) errors.Add("goal is not a known goal");
        if (state.DaysPerWeek is < 1 or > 6) errors.Add("daysPerWeek must be 1 to 6");

        if (state.Weeks is null) errors.Add("weeks is required");
        else
        {
            if (state.Weeks.Count > 12) errors.Add("at most 12 weeks");
            var previous = 0;
            foreach (var week in state.Weeks)
            {
                if (week is null) { errors.Add("weeks contains null"); continue; }
                var w = $"week {week.Number}";
                if (week.Number is < 1 or > 12) errors.Add($"{w}: week must be 1 to 12");
                if (week.Number <= previous) errors.Add($"{w}: weeks must be unique and sorted ascending");
                previous = week.Number;

                if (week.Days is null) { errors.Add($"{w}: days is required"); continue; }
                if (week.Days.Count > 7) errors.Add($"{w}: at most 7 days");
                var seen = new HashSet<WeekDay>();
                foreach (var day in week.Days)
                {
                    if (day is null) { errors.Add($"{w}: days contains null"); continue; }
                    var d = $"{w} {day.Name}";
                    if (!Enum.IsDefined(day.Name)) errors.Add($"{w}: unknown day");
                    if (!seen.Add(day.Name)) errors.Add($"{d}: day appears twice in the week");
                    if (day.Focus is null) errors.Add($"{d}: focus is required");
                    else if (day.Focus.Length > 40) errors.Add($"{d}: focus is at most 40 characters");

                    if (day.Exercises is null) { errors.Add($"{d}: exercises is required"); continue; }
                    if (day.Exercises.Count > 10) errors.Add($"{d}: at most 10 exercises");
                    for (var i = 0; i < day.Exercises.Count; i++)
                    {
                        var e = day.Exercises[i];
                        var x = $"{d} exercise {i + 1}";
                        if (e is null) { errors.Add($"{x}: is null"); continue; }
                        CheckExerciseId(e.ExerciseId, x, knownExerciseIds, errors);
                        if (e.Sets is < 1 or > 10) errors.Add($"{x}: sets must be an integer 1 to 10");
                        if (e.Reps is null || !RepsPattern().IsMatch(e.Reps)) errors.Add($"{x}: reps must look like \"5\", \"8-10\" or \"30s\"");
                        if (!IsRpe(e.Rpe)) errors.Add($"{x}: rpe must be 5 to 10 in steps of 0.5");
                        if (e.Note is null) errors.Add($"{x}: note is required (use \"\")");
                        else if (e.Note.Length > 140) errors.Add($"{x}: note is at most 140 characters");
                    }
                }
            }
        }

        if (state.Flags is null) errors.Add("flags is required");
        else
        {
            foreach (var flag in state.Flags)
            {
                if (flag is null) { errors.Add("flags contains null"); continue; }
                CheckExerciseId(flag.ExerciseId, "flag", knownExerciseIds, errors);
                if (flag.Reason is null) errors.Add("flag: reason is required");
                else if (flag.Reason.Length > 140) errors.Add("flag: reason is at most 140 characters");
            }
        }

        return errors;
    }

    private static void CheckExerciseId(string? id, string where, IReadOnlySet<string>? known, List<string> errors)
    {
        if (string.IsNullOrEmpty(id) || !IsId(id)) errors.Add($"{where}: exerciseId must be a kebab-case id");
        else if (known is not null && !known.Contains(id)) errors.Add($"{where}: unknown exerciseId '{id}' (use ids returned by searchExercises)");
    }

    private static bool IsId(string id) => id.Length <= 64 && IdPattern().IsMatch(id);

    private static bool IsRpe(double rpe) => rpe is >= 5 and <= 10 && Math.Abs(rpe * 2 - Math.Round(rpe * 2)) < 1e-9;
}

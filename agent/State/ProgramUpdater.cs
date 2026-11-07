using PtCoach.Agent.Models;

namespace PtCoach.Agent.State;

/// <summary>
/// CONTRACTS.md section 1a (<c>applyUpdate</c>), in order:
/// 1. clientId / goal / daysPerWeek: overwrite when present.
/// 2. removeDays: delete each matching (week, day); drop a week left with no days.
/// 3. days: find the week (create it if missing, weeks kept sorted); replace the day in place, else append it.
/// 4. flags: when present, replace the whole list.
/// 5. Return the complete new state.
/// Pure: the input state is never mutated.
/// </summary>
public static class ProgramUpdater
{
    public static ProgramState Apply(ProgramState state, UpdateProgramArgs args)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(args);

        // 1. Scalars.
        var clientId = args.ClientId ?? state.ClientId;
        var goal = args.Goal ?? state.Goal;
        var daysPerWeek = args.DaysPerWeek ?? state.DaysPerWeek;

        var weeks = (state.Weeks ?? [])
            .Select(w => new MutableWeek(w.Number, [.. w.Days ?? []]))
            .ToList();

        // 2. removeDays.
        foreach (var r in args.RemoveDays ?? [])
        {
            if (r is null) continue;
            var week = weeks.Find(w => w.Number == r.Week);
            if (week is null) continue;
            if (week.Days.RemoveAll(d => d.Name == r.Day) > 0 && week.Days.Count == 0)
            {
                weeks.Remove(week);
            }
        }

        // 3. days upsert.
        foreach (var u in args.Days ?? [])
        {
            if (u is null) continue;
            var week = weeks.Find(w => w.Number == u.Week);
            if (week is null)
            {
                week = new MutableWeek(u.Week, []);
                var at = weeks.FindIndex(w => w.Number > u.Week);
                weeks.Insert(at < 0 ? weeks.Count : at, week);
            }

            var day = new Day(u.Day, u.Focus ?? "", Normalize(u.Exercises));
            var index = week.Days.FindIndex(d => d.Name == u.Day);
            if (index >= 0) week.Days[index] = day;
            else week.Days.Add(day);
        }

        // 4. flags.
        var flags = args.Flags is { } f ? [.. f.Where(x => x is not null)] : state.Flags ?? [];

        // 5. Full state.
        return new ProgramState(
            clientId,
            goal,
            daysPerWeek,
            [.. weeks.Select(w => new Week(w.Number, [.. w.Days]))],
            flags);
    }

    // Models sometimes omit "note"; the state always carries it ("" when empty).
    private static IReadOnlyList<ExerciseEntry> Normalize(IReadOnlyList<ExerciseEntry>? exercises) =>
        [.. (exercises ?? []).Where(e => e is not null).Select(e => e.Note is null ? e with { Note = "" } : e)];

    private sealed record MutableWeek(int Number, List<Day> Days);
}

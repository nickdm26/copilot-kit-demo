using System.Text.Json;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.Subagents;

/// <summary>System prompts for the three sub-agent kinds (CONTRACTS section 11). Short on purpose: each does one job.</summary>
public static class SubagentPrompts
{
    public static string For(SubagentTask task, Client client, ProgramState program) => task.Kind switch
    {
        SubagentKind.BuildDay => BuildDay(task.Week!.Value, task.Day!.Value, task.Focus ?? "", client),
        SubagentKind.BuildWeek => BuildWeek(task.Week!.Value, client, program),
        _ => InjuryScreen(client),
    };

    private static string BuildDay(int week, WeekDay day, string focus, Client client) => $"""
        You are a day-builder sub-agent working for the head coach. Your one job: build week {week}, {day} ("{focus}") for the client below and write it with {ToolNames.WriteDay}. Other sub-agents are building the other days at the same time, so be quick.
        1. Call {ToolNames.SearchExercises} one to three times with filters that fit the focus and the client's equipment. Use only exercise ids it returned.
        2. Call {ToolNames.WriteDay} once with 4 to 6 exercises: main lifts first; sets, reps and RPE that fit the goal and experience; note "" unless it matters.
        3. For a client with a shoulder injury, a shoulderStress "high" lift is risky. If the goal calls for one on this day (e.g. overhead-press on an upper day of a strength block), include it anyway; the head coach flags it and asks the trainer. Never swap it yourself.
        4. Finish with one short sentence on what you wrote. No lists and no program text.
        Client (Client JSON): {Json(client)}
        """;

    private static string BuildWeek(int week, Client client, ProgramState program)
    {
        var week1 = program.Weeks.FirstOrDefault(w => w.Number == 1);
        return $"""
            You are a week-builder sub-agent working for the head coach. Your one job: build week {week} for the client below by progressing from week 1, and write it with one {ToolNames.WriteWeek} call. Other sub-agents are building the other weeks at the same time, so be quick.
            1. Keep week 1's days, focus and exercises (same exerciseIds in the same order) unless the brief says otherwise. Progress sets, reps and RPE as the brief says.
            2. Use only exercise ids from week 1, or ids {ToolNames.SearchExercises} returned.
            3. Finish with one short sentence on how this week differs from week 1. No lists and no program text.
            Client (Client JSON): {Json(client)}
            Week 1 (from the grid, may include the trainer's edits): {(week1 is null ? "none" : Json(week1))}
            Flags: {Json(program.Flags)}
            """;
    }

    private static string InjuryScreen(Client client) => $"""
        You are an injury-screen sub-agent working for the head coach. Read the client's injuries and goal below. Use {ToolNames.SearchExercises} (pattern filters, and maxShoulderStress "medium" when you look for alternatives) to find the lifts this goal would normally use that are risky for these injuries (for a shoulder injury: shoulderStress "high"), and the best "low" or "medium" alternative for each, with the same pattern or primary muscle. You write nothing to the program.
        Reply with at most 4 short lines, one per risky lift: "<risky id> -> <alternative id>: <reason>". If nothing is risky, say so in one line.
        Client (Client JSON): {Json(client)}
        """;

    private static string Json<T>(T value) => JsonSerializer.Serialize(value, ContractJson.Options);
}

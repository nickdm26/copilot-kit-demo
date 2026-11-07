using System.Text.Json.Serialization;

namespace PtCoach.Agent.Models;

// The shared program state. Matches shared/program.schema.json.
// Serialize with ContractJson.Options (camelCase).

public sealed record ProgramState(
    string ClientId,
    Goal Goal,
    int DaysPerWeek,
    IReadOnlyList<Week> Weeks,
    IReadOnlyList<Flag> Flags)
{
    public static ProgramState Empty(string clientId, Goal goal = Goal.General, int daysPerWeek = 3) =>
        new(clientId, goal, daysPerWeek, [], []);
}

// C# members can't share their type's name, so these two rename the property and keep the wire name.
public sealed record Week([property: JsonPropertyName("week")] int Number, IReadOnlyList<Day> Days);

public sealed record Day([property: JsonPropertyName("day")] WeekDay Name, string Focus, IReadOnlyList<ExerciseEntry> Exercises);

/// <param name="Reps">"5", "8-10" or "30s".</param>
/// <param name="Rpe">5 to 10 in steps of 0.5.</param>
public sealed record ExerciseEntry(string ExerciseId, int Sets, string Reps, double Rpe, string Note);

public sealed record Flag(string ExerciseId, string Reason);

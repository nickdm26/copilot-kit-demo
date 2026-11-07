namespace PtCoach.Agent.Models;

// Shapes of shared/seed/exercises.json and shared/seed/clients.json.

/// <param name="Muscles">First entry is the primary muscle.</param>
/// <param name="Cues">Two or three short coaching cues.</param>
public sealed record Exercise(
    string Id,
    string Name,
    Pattern Pattern,
    IReadOnlyList<Muscle> Muscles,
    IReadOnlyList<Equipment> Equipment,
    ShoulderStress ShoulderStress,
    IReadOnlyList<string> Cues);

public sealed record Injury(InjuryArea Area, Side? Side, Severity Severity, string Note);

public sealed record Client(
    string Id,
    string Name,
    int Age,
    Goal Goal,
    Experience Experience,
    int DaysPerWeek,
    IReadOnlyList<Equipment> Equipment,
    IReadOnlyList<Injury> Injuries,
    string Notes);

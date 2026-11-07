using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;
using PtCoach.Agent.Seed;

namespace PtCoach.Agent.Tools;

/// <summary>Backend read tools over the seed files: getClient and searchExercises (CONTRACTS section 3).</summary>
public sealed class CoachTools(SeedStore seed)
{
    public const int MaxResults = 10;

    // A private copy of the contract options with an explicit resolver, so tool schemas
    // do not depend on the process-wide reflection default.
    private static readonly JsonSerializerOptions ToolJson = new(ContractJson.Options)
    {
        TypeInfoResolver = new DefaultJsonTypeInfoResolver(),
    };

    public IReadOnlyList<AITool> CreateAll() =>
    [
        AIFunctionFactory.Create(GetClient, ToolNames.GetClient,
            "Get one client profile (goal, experience, equipment, injuries, notes) by id.", ToolJson),
        AIFunctionFactory.Create(SearchExercises, ToolNames.SearchExercises,
            "Search the exercise library. All filters are optional and combined with AND. Returns at most 10 exercises.",
            ToolJson),
    ];

    /// <returns>The client, or an error string for an unknown id.</returns>
    public object GetClient([Description("Client id, e.g. 'sarah'.")] string clientId)
    {
        var client = seed.FindClient(clientId);
        return client is null
            ? $"Error: unknown client '{clientId}'. Known ids: {string.Join(", ", seed.Clients.Select(c => c.Id))}."
            : client;
    }

    public IReadOnlyList<Exercise> SearchExercises(
        [Description("Case-insensitive text matched against exercise name or id.")] string? query = null,
        [Description("Movement pattern.")] Pattern? pattern = null,
        [Description("Muscle worked (primary or secondary).")] Muscle? muscle = null,
        [Description("Required equipment.")] Equipment? equipment = null,
        [Description("Highest acceptable shoulder stress: low, medium or high (low < medium < high).")] ShoulderStress? maxShoulderStress = null)
    {
        IEnumerable<Exercise> results = seed.Exercises;
        if (!string.IsNullOrWhiteSpace(query))
        {
            var q = query.Trim();
            results = results.Where(e =>
                e.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                e.Id.Contains(q, StringComparison.OrdinalIgnoreCase));
        }
        if (pattern is { } p) results = results.Where(e => e.Pattern == p);
        if (muscle is { } m) results = results.Where(e => e.Muscles.Contains(m));
        if (equipment is { } eq) results = results.Where(e => e.Equipment.Contains(eq));
        if (maxShoulderStress is { } max) results = results.Where(e => e.ShoulderStress <= max);
        return results.Take(MaxResults).ToList();
    }
}

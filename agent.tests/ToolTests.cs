using System.Text.Json;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;
using PtCoach.Agent.Seed;
using PtCoach.Agent.Tools;

namespace PtCoach.Agent.Tests;

public class ToolTests
{
    private static readonly string FixtureDir = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    private static AIFunction Tool(string name) =>
        (AIFunction)new CoachTools(new SeedStore(FixtureDir)).CreateAll().Single(t => t.Name == name);

    private static async Task<JsonElement> Call(string name, params (string, object?)[] args)
    {
        var a = new AIFunctionArguments();
        foreach (var (k, v) in args) a[k] = v;
        var result = await Tool(name).InvokeAsync(a);
        return result is JsonElement je ? je : JsonSerializer.SerializeToElement(result, ContractJson.Options);
    }

    private static string[] Ids(JsonElement arr) => arr.EnumerateArray().Select(e => e.GetProperty("id").GetString()!).ToArray();

    [Fact]
    public void Tools_use_contract_names()
    {
        var names = new CoachTools(new SeedStore(FixtureDir)).CreateAll().Select(t => t.Name).ToArray();
        Assert.Equal([ToolNames.GetClient, ToolNames.SearchExercises], names);
    }

    [Fact]
    public async Task GetClient_returns_client_json()
    {
        var r = await Call(ToolNames.GetClient, ("clientId", "sarah"));
        Assert.Equal("sarah", r.GetProperty("id").GetString());
        Assert.Equal("shoulder", r.GetProperty("injuries")[0].GetProperty("area").GetString());
    }

    [Fact]
    public async Task GetClient_unknown_returns_error_string()
    {
        var r = await Call(ToolNames.GetClient, ("clientId", "nobody"));
        Assert.Equal(JsonValueKind.String, r.ValueKind);
        Assert.Contains("unknown client", r.GetString());
    }

    [Fact]
    public async Task Search_query_matches_name_or_id_case_insensitively()
    {
        Assert.Equal(["back-squat", "goblet-squat"], Ids(await Call(ToolNames.SearchExercises, ("query", "SQUAT"))));
        Assert.Equal(["dumbbell-floor-press"], Ids(await Call(ToolNames.SearchExercises, ("query", "floor"))));
    }

    [Fact]
    public async Task Search_filters_are_anded()
    {
        var r = await Call(ToolNames.SearchExercises, ("pattern", "vertical-push"), ("equipment", "barbell"), ("maxShoulderStress", "medium"));
        Assert.Equal(["landmine-press"], Ids(r));
    }

    [Fact]
    public async Task Search_max_shoulder_stress_orders_low_medium_high()
    {
        Assert.Equal(["goblet-squat", "dumbbell-floor-press", "face-pull"], Ids(await Call(ToolNames.SearchExercises, ("maxShoulderStress", "low"))));
        Assert.Equal(5, (await Call(ToolNames.SearchExercises, ("maxShoulderStress", "medium"))).GetArrayLength());
        Assert.Equal(6, (await Call(ToolNames.SearchExercises, ("maxShoulderStress", "high"))).GetArrayLength());
    }

    [Fact]
    public async Task Search_muscle_and_no_filters()
    {
        Assert.Equal(["overhead-press", "landmine-press", "face-pull"], Ids(await Call(ToolNames.SearchExercises, ("muscle", "shoulders"))));
        Assert.Equal(6, (await Call(ToolNames.SearchExercises)).GetArrayLength());
    }

    [Fact]
    public void Search_returns_at_most_ten()
    {
        var dir = Directory.CreateTempSubdirectory().FullName;
        var items = Enumerable.Range(0, 15).Select(i =>
            $$"""{ "id": "ex-{{i}}", "name": "Ex {{i}}", "pattern": "core", "muscles": ["core"], "equipment": ["bodyweight"], "shoulderStress": "low", "cues": ["a", "b"] }""");
        File.WriteAllText(Path.Combine(dir, "exercises.json"), "[" + string.Join(",", items) + "]");
        var result = new CoachTools(new SeedStore(dir)).SearchExercises();
        Assert.Equal(10, result.Count);
    }

    [Fact]
    public void Missing_seed_files_fail_with_clear_message_only_when_used()
    {
        var store = new SeedStore(Path.Combine(Path.GetTempPath(), "does-not-exist"));
        var ex = Assert.Throws<InvalidOperationException>(() => store.Exercises);
        Assert.Contains("exercises.json", ex.Message);
    }
}

using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging.Abstractions;
using PtCoach.Agent.Models;
using PtCoach.Agent.Tools;

namespace PtCoach.Agent.Tests;

/// <summary>showHowTo and its validator. Same cases as web/src/components/declarative/schema.test.mjs.</summary>
public class ShowHowToToolTests
{
    // The example from PT_COACH_BUILD_PLAN.md Task 9.
    private const string PauseSquat = """
        {
          "type": "Card",
          "children": [
            { "type": "Heading", "text": "Pause squat", "meta": "Tempo 3-2-X" },
            { "type": "Stepper", "steps": [
              { "title": "Brace", "cue": "Big breath into your belly.", "figure": { "pose": "stand" } },
              { "title": "Lower for 3 seconds", "cue": "Knees track over the toes.", "figure": { "pose": "half", "marker": "down" } },
              { "title": "Pause for 2 seconds", "cue": "Stay tight. No bounce.", "figure": { "pose": "bottom", "marker": "hold" } },
              { "title": "Drive up fast", "cue": "Chest and hips rise together.", "figure": { "pose": "half", "marker": "up" } }
            ] },
            { "type": "TempoStrip", "segments": ["3s down", "2s pause", "Up fast"], "follows": "Stepper" },
            { "type": "Callout", "tone": "flag", "text": "For Aroha: wider grip, elbows down." }
          ]
        }
        """;

    private static IReadOnlyList<string> Validate(string json) => HowToValidator.ValidateJson(json);

    private static string NestedCards(int levels)
    {
        var node = """{ "type": "Heading", "text": "Deep" }""";
        for (var i = 0; i < levels; i++) node = $$"""{ "type": "Card", "children": [{{node}}] }""";
        return node;
    }

    /// <summary>1 + 2 x count nodes.</summary>
    private static string Wide(int count) =>
        $$"""{ "type": "Card", "children": [{{string.Join(",", Enumerable.Range(1, count).Select(i =>
            $$"""{ "type": "Card", "children": [{ "type": "Heading", "text": "Part {{i}}" }] }"""))}}] }""";

    private static async Task<string> Invoke(params (string Key, object? Value)[] args)
    {
        var tool = new ShowHowToTool(NullLogger<ShowHowToTool>.Instance);
        var a = new AIFunctionArguments();
        foreach (var (k, v) in args) a[k] = v;
        return (string)(await tool.InvokeAsync(a, TestContext.Current.CancellationToken))!;
    }

    [Fact]
    public void Plan_example_passes() => Assert.Empty(Validate(PauseSquat));

    [Fact]
    public async Task Tool_accepts_the_example_as_an_object_or_a_string()
    {
        Assert.Equal(ShowHowToTool.ShownResult, await Invoke(("ui", JsonDocument.Parse(PauseSquat).RootElement.Clone())));
        Assert.Equal(ShowHowToTool.ShownResult, await Invoke(("ui", PauseSquat)));
        Assert.Equal(ShowHowToTool.ShownResult, await Invoke(("ui", JsonNode.Parse(PauseSquat))));
    }

    [Fact]
    public void Script_type_fails()
    {
        var errors = Validate("""{ "type": "Card", "children": [{ "type": "Script", "src": "x.js" }] }""");
        Assert.Contains(errors, e => e.Contains("not a catalog type"));
    }

    [Theory]
    [InlineData("""{ "type": "Heading", "text": "Pause squat", "html": "<b>x</b>" }""")]
    [InlineData("""{ "type": "Callout", "tone": "flag", "text": "x", "style": "color:red" }""")]
    [InlineData("""{ "type": "PoseFigure", "pose": "stand", "points": [[0, 0]] }""")]
    [InlineData("""{ "type": "Stepper", "steps": [{ "title": "Brace", "cue": "Breathe.", "figure": { "pose": "stand", "x": 1 } }] }""")]
    public void Extra_props_fail(string json) => Assert.NotEmpty(Validate(json));

    [Theory]
    [InlineData("""{ "type": "Heading", "text": 42 }""")]
    [InlineData("""{ "type": "PoseFigure", "pose": "handstand" }""")]
    [InlineData("""{ "type": "Callout", "tone": "danger", "text": "x" }""")]
    [InlineData("""{ "type": "TempoStrip", "segments": ["3s down"], "follows": "Heading" }""")]
    [InlineData("""{ "type": "Card", "children": "nope" }""")]
    [InlineData("""{ "type": "Heading", "text": null }""")]
    [InlineData("null")]
    [InlineData("{not json")]
    public void Wrong_types_fail(string json) => Assert.NotEmpty(Validate(json));

    [Fact]
    public void Null_optional_prop_counts_as_absent() =>
        Assert.Empty(Validate("""{ "type": "Heading", "text": "Pause squat", "meta": null }"""));

    [Fact]
    public void Depth_over_4_fails()
    {
        Assert.Empty(Validate(NestedCards(HowToValidator.MaxDepth - 1)));
        Assert.Contains(Validate(NestedCards(HowToValidator.MaxDepth)), e => e.Contains("deeper"));
        Assert.NotEmpty(Validate(NestedCards(40)));
    }

    [Fact]
    public void More_than_50_nodes_fails()
    {
        Assert.Empty(Validate($$"""{ "type": "Card", "children": [{{Wide(8)}}, {{Wide(8)}}, {{Wide(7)}}] }""")); // exactly 50
        Assert.Contains(
            Validate($$"""{ "type": "Card", "children": [{{Wide(9)}}, {{Wide(9)}}, {{Wide(9)}}] }"""), // 58
            e => e.Contains("more than 50 nodes"));
    }

    [Fact]
    public async Task Errors_go_back_to_the_model()
    {
        var result = await Invoke(("ui", """{ "type": "Script" }"""));
        Assert.StartsWith(ShowHowToTool.ErrorPrefix, result);
        Assert.Contains(ToolNames.ShowHowTo, result);

        Assert.StartsWith(ShowHowToTool.ErrorPrefix, await Invoke(("ui", PauseSquat), ("html", "<b>x</b>")));
        Assert.StartsWith(ShowHowToTool.ErrorPrefix, await Invoke());
    }

    [Fact]
    public void Tool_has_contract_name_and_a_schema_listing_every_type()
    {
        var tool = Assert.IsType<ShowHowToTool>(
            Assert.Single(new HowToExtension(NullLogger<ShowHowToTool>.Instance).GetTools("any")));
        Assert.Equal("showHowTo", tool.Name);
        var schema = tool.JsonSchema.GetRawText();
        foreach (var type in HowToValidator.Types) Assert.Contains($"\"{type}\"", schema);
        foreach (var type in HowToValidator.Types) Assert.Contains(type, tool.Description);
    }
}

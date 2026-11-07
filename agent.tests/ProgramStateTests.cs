using System.Text.Json;
using AGUI.Abstractions;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging.Abstractions;
using PtCoach.Agent.Models;
using PtCoach.Agent.Seed;
using PtCoach.Agent.State;

namespace PtCoach.Agent.Tests;

public class ProgramUpdaterTests
{
    private static ExerciseEntry Ex(string id, int sets = 3) => new(id, sets, "5", 7, "");

    private static Day D(WeekDay day, string focus, params string[] ids) => new(day, focus, [.. ids.Select(i => Ex(i))]);

    private static ProgramDayUpsert U(int week, WeekDay day, string focus, params string[] ids) =>
        new(week, day, focus, [.. ids.Select(i => Ex(i))]);

    private static readonly ProgramState Base = new(
        "sarah", Goal.Strength, 3,
        [
            new Week(1, [D(WeekDay.Mon, "Lower", "back-squat"), D(WeekDay.Wed, "Upper", "face-pull")]),
            new Week(3, [D(WeekDay.Mon, "Lower", "goblet-squat")]),
        ],
        [new Flag("overhead-press", "left shoulder")]);

    [Fact]
    public void Scalars_overwrite_only_when_present()
    {
        var kept = ProgramUpdater.Apply(Base, new UpdateProgramArgs());
        Assert.Equal(("sarah", Goal.Strength, 3), (kept.ClientId, kept.Goal, kept.DaysPerWeek));

        var changed = ProgramUpdater.Apply(Base, new UpdateProgramArgs(ClientId: "tom", Goal: Goal.General, DaysPerWeek: 2));
        Assert.Equal(("tom", Goal.General, 2), (changed.ClientId, changed.Goal, changed.DaysPerWeek));
        Assert.Equal(Base.Weeks.Count, changed.Weeks.Count);
    }

    [Fact]
    public void RemoveDays_deletes_matching_days_and_drops_empty_weeks()
    {
        var next = ProgramUpdater.Apply(Base, new UpdateProgramArgs(RemoveDays:
        [
            new DayRef(1, WeekDay.Wed),
            new DayRef(3, WeekDay.Mon),
            new DayRef(2, WeekDay.Mon), // no such week: ignored
            new DayRef(1, WeekDay.Fri), // no such day: ignored
        ]));
        var week = Assert.Single(next.Weeks);
        Assert.Equal(1, week.Number);
        Assert.Equal([WeekDay.Mon], week.Days.Select(d => d.Name));
    }

    [Fact]
    public void Days_replace_in_place_or_append()
    {
        var next = ProgramUpdater.Apply(Base, new UpdateProgramArgs(Days:
        [
            U(1, WeekDay.Fri, "Full body", "landmine-press"),
            U(1, WeekDay.Mon, "Lower B", "goblet-squat"),
        ]));
        var week1 = next.Weeks[0];
        Assert.Equal([WeekDay.Mon, WeekDay.Wed, WeekDay.Fri], week1.Days.Select(d => d.Name));
        Assert.Equal("Lower B", week1.Days[0].Focus);
        Assert.Equal("goblet-squat", Assert.Single(week1.Days[0].Exercises).ExerciseId);
        Assert.Equal("Upper", week1.Days[1].Focus);
    }

    [Fact]
    public void Days_create_missing_weeks_in_sorted_order()
    {
        var next = ProgramUpdater.Apply(Base, new UpdateProgramArgs(Days:
        [
            U(4, WeekDay.Mon, "Lower", "back-squat"),
            U(2, WeekDay.Tue, "Upper", "face-pull"),
        ]));
        Assert.Equal([1, 2, 3, 4], next.Weeks.Select(w => w.Number));
        Assert.Equal(WeekDay.Tue, Assert.Single(next.Weeks[1].Days).Name);
    }

    [Fact]
    public void RemoveDays_runs_before_days()
    {
        // Removing week 3's only day drops the week; the upsert then recreates it.
        var next = ProgramUpdater.Apply(Base, new UpdateProgramArgs(
            Days: [U(3, WeekDay.Thu, "Upper", "face-pull")],
            RemoveDays: [new DayRef(3, WeekDay.Mon)]));
        Assert.Equal([WeekDay.Thu], next.Weeks[1].Days.Select(d => d.Name));
    }

    [Fact]
    public void Flags_replace_whole_list_only_when_present()
    {
        Assert.Equal(Base.Flags, ProgramUpdater.Apply(Base, new UpdateProgramArgs()).Flags);
        Assert.Empty(ProgramUpdater.Apply(Base, new UpdateProgramArgs(Flags: [])).Flags);
        var replaced = ProgramUpdater.Apply(Base, new UpdateProgramArgs(Flags: [new Flag("landmine-press", "check")]));
        Assert.Equal("landmine-press", Assert.Single(replaced.Flags).ExerciseId);
    }

    [Fact]
    public void Apply_does_not_mutate_input_and_fills_missing_notes()
    {
        var before = JsonSerializer.Serialize(Base, ContractJson.Options);
        var next = ProgramUpdater.Apply(Base, new UpdateProgramArgs(Days:
            [new ProgramDayUpsert(1, WeekDay.Mon, "Lower", [new ExerciseEntry("back-squat", 5, "5", 8, null!)])]));
        Assert.Equal(before, JsonSerializer.Serialize(Base, ContractJson.Options));
        Assert.Equal("", next.Weeks[0].Days[0].Exercises[0].Note);
    }
}

public class ProgramStateAgentTests
{
    [Fact]
    public void State_message_goes_just_before_the_latest_user_message()
    {
        var state = ProgramState.Empty("sarah");
        var history = new List<ChatMessage>
        {
            new(ChatRole.User, "build it"),
            new(ChatRole.Assistant, "done"),
            new(ChatRole.User, "rebalance week 1"),
        };
        var result = ProgramStateAgent.WithStateMessage(history, state);
        Assert.Equal(4, result.Count);
        Assert.StartsWith(ProgramStateAgent.StateMessagePrefix, result[2].Text);
        Assert.Equal(ChatRole.System, result[2].Role);
        Assert.Equal("rebalance week 1", result[3].Text);

        Assert.StartsWith(ProgramStateAgent.StateMessagePrefix, Assert.Single(ProgramStateAgent.WithStateMessage([], state)).Text);
    }
}

public class ProgramStateValidatorTests
{
    private static readonly HashSet<string> Exercises = ["back-squat", "face-pull"];

    private static ProgramState Valid() => new("sarah", Goal.Strength, 3,
        [new Week(1, [new Day(WeekDay.Mon, "Lower", [new ExerciseEntry("back-squat", 4, "8-10", 7.5, "")])])], []);

    [Fact]
    public void Valid_state_passes() => Assert.Empty(ProgramStateValidator.Validate(Valid(), Exercises));

    [Theory]
    [InlineData("reps", "8 reps")]
    [InlineData("rpe", "7.3")]
    [InlineData("rpe", "11")]
    [InlineData("sets", "0")]
    [InlineData("exerciseId", "made-up-lift")]
    public void Bad_entries_fail(string field, string value)
    {
        var e = Valid().Weeks[0].Days[0].Exercises[0];
        e = field switch
        {
            "reps" => e with { Reps = value },
            "rpe" => e with { Rpe = double.Parse(value, System.Globalization.CultureInfo.InvariantCulture) },
            "sets" => e with { Sets = int.Parse(value) },
            _ => e with { ExerciseId = value },
        };
        var state = Valid() with { Weeks = [new Week(1, [new Day(WeekDay.Mon, "Lower", [e])])] };
        Assert.NotEmpty(ProgramStateValidator.Validate(state, Exercises));
    }

    [Fact]
    public void Unsorted_weeks_duplicate_days_and_missing_client_fail()
    {
        var day = Valid().Weeks[0].Days[0];
        Assert.NotEmpty(ProgramStateValidator.Validate(Valid() with { Weeks = [new Week(2, [day]), new Week(1, [day])] }));
        Assert.NotEmpty(ProgramStateValidator.Validate(Valid() with { Weeks = [new Week(1, [day, day])] }));
        Assert.Contains(ProgramStateValidator.Validate(Valid() with { ClientId = "" }), e => e.Contains("clientId"));
    }
}

public class UpdateProgramToolTests
{
    private static readonly string FixtureDir = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    private static ProgramStateStore Store() => new(new SeedStore(FixtureDir), NullLogger<ProgramStateStore>.Instance);

    private static UpdateProgramTool Tool(ProgramStateStore store) => new(store, NullLogger<UpdateProgramTool>.Instance);

    private static AIFunctionArguments Args(string json)
    {
        var a = new AIFunctionArguments();
        foreach (var p in JsonDocument.Parse(json).RootElement.EnumerateObject()) a[p.Name] = p.Value.Clone();
        return a;
    }

    private static RunAgentInput Input(string? stateJson) => new()
    {
        ThreadId = "t-" + Guid.NewGuid(),
        RunId = "r-" + Guid.NewGuid(),
        Messages = [],
        State = stateJson is null ? default : JsonDocument.Parse(stateJson).RootElement.Clone(),
    };

    private const string MonCall = """
        { "clientId": "sarah", "goal": "strength", "daysPerWeek": 3,
          "days": [ { "week": 1, "day": "Mon", "focus": "Lower",
                      "exercises": [ { "exerciseId": "back-squat", "sets": 4, "reps": "5", "rpe": 7, "note": "" } ] } ] }
        """;

    private const string WedCall = """
        { "days": [ { "week": 1, "day": "Wed", "focus": "Upper",
                      "exercises": [ { "exerciseId": "overhead-press", "sets": 3, "reps": "8", "rpe": 7.5 } ] } ],
          "flags": [ { "exerciseId": "overhead-press", "reason": "left shoulder" } ] }
        """;

    [Fact]
    public void Tool_uses_contract_name_and_schema_matches_args_record()
    {
        var tool = Tool(Store());
        Assert.Equal(ToolNames.UpdateProgram, tool.Name);
        var schemaProps = tool.JsonSchema.GetProperty("properties").EnumerateObject().Select(p => p.Name).Order();
        var recordProps = typeof(UpdateProgramArgs).GetProperties()
            .Select(p => JsonNamingPolicy.CamelCase.ConvertName(p.Name)).Order();
        Assert.Equal(recordProps, schemaProps);
    }

    [Fact]
    public void Calls_in_one_run_accumulate_and_return_full_state()
    {
        var store = Store();
        var tool = Tool(store);
        var copy = store.ForRun(Input(null));

        Assert.IsType<JsonElement>(tool.Invoke(copy, Args(MonCall)));
        var result = Assert.IsType<JsonElement>(tool.Invoke(copy, Args(WedCall)));

        var state = result.Deserialize<ProgramState>(ContractJson.Options)!;
        Assert.Equal("sarah", state.ClientId);
        Assert.Equal([WeekDay.Mon, WeekDay.Wed], state.Weeks[0].Days.Select(d => d.Name));
        Assert.Equal("", state.Weeks[0].Days[1].Exercises[0].Note);
        Assert.Equal("overhead-press", Assert.Single(state.Flags).ExerciseId);
        Assert.Equal(result.GetRawText(), JsonSerializer.Serialize(copy.State, ContractJson.Options));
    }

    [Fact]
    public void Working_copy_is_seeded_from_client_state_and_runs_are_isolated()
    {
        var store = Store();
        var tool = Tool(store);
        var clientState = """
            { "clientId": "sarah", "goal": "strength", "daysPerWeek": 3, "flags": [],
              "weeks": [ { "week": 1, "days": [ { "day": "Fri", "focus": "Trainer edit",
                "exercises": [ { "exerciseId": "goblet-squat", "sets": 9, "reps": "10", "rpe": 6, "note": "" } ] } ] } ] }
            """;
        var runA = Input(clientState);
        var runB = Input(null);

        Assert.Same(store.ForRun(runA), store.ForRun(runA));
        Assert.NotSame(store.ForRun(runA), store.ForRun(runB));

        var a = Assert.IsType<JsonElement>(tool.Invoke(store.ForRun(runA), Args(MonCall))).Deserialize<ProgramState>(ContractJson.Options)!;
        Assert.Equal([WeekDay.Fri, WeekDay.Mon], a.Weeks[0].Days.Select(d => d.Name));
        Assert.Equal(9, a.Weeks[0].Days[0].Exercises[0].Sets);

        // Run B never saw run A's state or writes.
        Assert.Empty(store.ForRun(runB).State.Weeks);
    }

    [Theory]
    [InlineData("""{ "clientId": "sarah" }""")] // missing fields
    [InlineData("""{ "clientId": "sarah", "goal": "strength", "daysPerWeek": 3, "weeks": [], "flags": [], "extra": 1 }""")]
    [InlineData("""{ "clientId": "sarah", "goal": "lazy", "daysPerWeek": 3, "weeks": [], "flags": [] }""")]
    [InlineData("""{ "clientId": "sarah", "goal": "strength", "daysPerWeek": 3, "flags": [], "weeks": [ { "week": 1, "days": [ { "day": "Mon", "focus": "", "exercises": [ { "exerciseId": "back-squat", "sets": 4, "reps": "lots", "rpe": 7, "note": "" } ] } ] } ] }""")]
    [InlineData("""[1, 2, 3]""")]
    public void Invalid_client_state_becomes_empty(string stateJson)
    {
        var state = Store().ReadClientState(Input(stateJson));
        Assert.Equal(ProgramStateStore.Empty(), state with { Weeks = [], Flags = [] });
        Assert.Empty(state.Weeks);
    }

    [Fact]
    public void Empty_object_state_is_the_empty_program()
    {
        var state = Store().ReadClientState(Input("{}"));
        Assert.Equal("", state.ClientId);
        Assert.Empty(state.Weeks);
    }

    [Fact]
    public void Invalid_calls_return_an_error_string_and_change_nothing()
    {
        var store = Store();
        var tool = Tool(store);
        var copy = store.ForRun(Input(null));
        tool.Invoke(copy, Args(MonCall));
        var before = copy.State;

        var unknownId = tool.Invoke(copy, Args("""
            { "days": [ { "week": 1, "day": "Tue", "focus": "x", "exercises": [ { "exerciseId": "nope", "sets": 3, "reps": "5", "rpe": 7, "note": "" } ] } ] }
            """));
        var extraField = tool.Invoke(copy, Args("""{ "week": 1 }"""));
        var noClient = tool.Invoke(store.ForRun(Input(null)), Args("""{ "goal": "strength" }"""));

        Assert.All([unknownId, extraField, noClient], r => Assert.StartsWith(UpdateProgramTool.ErrorPrefix, Assert.IsType<string>(r)));
        Assert.Contains("nope", (string)unknownId);
        Assert.Contains("clientId", (string)noClient);
        Assert.Same(before, copy.State);
    }

    [Fact]
    public void Stringified_nested_arrays_are_accepted()
    {
        var store = Store();
        var copy = store.ForRun(Input(null));
        var args = new AIFunctionArguments
        {
            ["clientId"] = "sarah",
            ["days"] = """[ { "week": 2, "day": "Thu", "focus": "Upper", "exercises": [] } ]""",
        };
        var result = Assert.IsType<JsonElement>(Tool(store).Invoke(copy, args));
        Assert.Equal(2, result.GetProperty("weeks")[0].GetProperty("week").GetInt32());
    }
}

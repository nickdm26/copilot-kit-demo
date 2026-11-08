using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization.Metadata;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.State;

/// <summary>
/// The updateProgram backend tool (CONTRACTS sections 1a, 3 and 9, Plan A). Applies <see cref="ProgramUpdater"/> to the
/// run's working copy and returns the full ProgramState as a <see cref="JsonElement"/>, which the AG-UI host maps to
/// STATE_SNAPSHOT. An invalid call returns an error string instead and leaves the state unchanged.
/// </summary>
public sealed class UpdateProgramTool(ProgramStateStore store, ILogger<UpdateProgramTool> logger) : AIFunction
{
    /// <summary>Prefix of every error result. Error results are strings, never state.</summary>
    public const string ErrorPrefix = "Error:";

    private static readonly string[] ListArgs = ["days", "removeDays", "flags"];

    private static readonly JsonSerializerOptions ToolJson = new(ContractJson.Options)
    {
        TypeInfoResolver = new DefaultJsonTypeInfoResolver(),
    };

    // Mirrors UpdateProgramArgsSchema in web/src/lib/contracts.ts (a test checks the property names against UpdateProgramArgs).
    private static readonly JsonElement Schema = JsonDocument.Parse("""
        {
          "type": "object",
          "properties": {
            "clientId": { "type": "string", "description": "Client id, e.g. \"sarah\". Set it on the first call." },
            "goal": { "type": "string", "enum": ["strength", "hypertrophy", "general", "endurance-support"] },
            "daysPerWeek": { "type": "integer", "minimum": 1, "maximum": 6 },
            "days": {
              "type": "array",
              "maxItems": 28,
              "description": "Days to add or replace, matched on (week, day). A day you send replaces that whole day.",
              "items": {
                "type": "object",
                "properties": {
                  "week": { "type": "integer", "minimum": 1, "maximum": 12 },
                  "day": { "type": "string", "enum": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
                  "focus": { "type": "string", "maxLength": 40, "description": "e.g. \"Lower\", \"Upper\", \"Full body\"" },
                  "exercises": {
                    "type": "array",
                    "maxItems": 10,
                    "items": {
                      "type": "object",
                      "properties": {
                        "exerciseId": { "type": "string", "description": "An id returned by searchExercises." },
                        "sets": { "type": "integer", "minimum": 1, "maximum": 10 },
                        "reps": { "type": "string", "pattern": "^[0-9]{1,2}(-[0-9]{1,2}|s)?$", "description": "\"5\", \"8-10\" or \"30s\"" },
                        "rpe": { "type": "number", "minimum": 5, "maximum": 10, "multipleOf": 0.5 },
                        "note": { "type": "string", "maxLength": 140, "description": "Short note, or \"\"." }
                      },
                      "required": ["exerciseId", "sets", "reps", "rpe", "note"],
                      "additionalProperties": false
                    }
                  }
                },
                "required": ["week", "day", "focus", "exercises"],
                "additionalProperties": false
              }
            },
            "removeDays": {
              "type": "array",
              "description": "Days to delete, matched on (week, day).",
              "items": {
                "type": "object",
                "properties": {
                  "week": { "type": "integer", "minimum": 1, "maximum": 12 },
                  "day": { "type": "string", "enum": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] }
                },
                "required": ["week", "day"],
                "additionalProperties": false
              }
            },
            "flags": {
              "type": "array",
              "description": "When present, replaces the whole flags list. Omit it to keep the current flags.",
              "items": {
                "type": "object",
                "properties": {
                  "exerciseId": { "type": "string" },
                  "reason": { "type": "string", "maxLength": 140, "description": "Short reason, e.g. \"left shoulder\"." }
                },
                "required": ["exerciseId", "reason"],
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        }
        """).RootElement.Clone();

    /// <summary>The schema of one day's <c>exercises</c> array, shared with the sub-agents' writeDay and writeWeek tools.</summary>
    public static JsonElement ExercisesSchema { get; } = Schema.GetProperty("properties").GetProperty("days")
        .GetProperty("items").GetProperty("properties").GetProperty("exercises").Clone();

    public override string Name => ToolNames.UpdateProgram;

    public override string Description =>
        "Write to the program grid. All fields are optional. Days are upserted on (week, day); removeDays deletes days; " +
        "flags, when present, replaces the flag list. Returns the full program state after the update. " +
        "When building a program, send week 1 one day per call (the trainer watches the grid fill), then one call per later week.";

    public override JsonElement JsonSchema => Schema;

    public override JsonSerializerOptions JsonSerializerOptions => ToolJson;

    protected override ValueTask<object?> InvokeCoreAsync(AIFunctionArguments arguments, CancellationToken cancellationToken)
    {
        var copy = store.ForRun(FunctionInvokingChatClient.CurrentContext?.Options);
        if (copy is null)
        {
            // Outside an AG-UI run there is no client state to build on; start empty rather than share anything.
            logger.LogWarning("updateProgram called outside an AG-UI run; using an empty program.");
            copy = new ProgramWorkingCopy(ProgramStateStore.Empty());
        }
        return ValueTask.FromResult<object?>(Invoke(copy, arguments));
    }

    /// <summary>Apply one call to <paramref name="copy"/>. Returns the full state (JsonElement) or an error string.</summary>
    public object Invoke(ProgramWorkingCopy copy, AIFunctionArguments arguments)
    {
        UpdateProgramArgs args;
        try
        {
            args = ParseArgs(arguments);
        }
        catch (JsonException ex)
        {
            logger.LogInformation("updateProgram rejected arguments: {Message}", ex.Message);
            return $"{ErrorPrefix} invalid arguments: {ex.Message} Nothing was changed.";
        }

        lock (copy.Gate)
        {
            var next = ProgramUpdater.Apply(copy.State, args);
            var errors = ProgramStateValidator.Validate(next, store.ExerciseIds, store.ClientIds);
            if (errors.Count > 0)
            {
                logger.LogInformation("updateProgram rejected update: {Errors}", string.Join("; ", errors));
                return $"{ErrorPrefix} {string.Join("; ", errors.Take(8))}. Nothing was changed; fix these and call {ToolNames.UpdateProgram} again.";
            }
            copy.State = next;
            return JsonSerializer.SerializeToElement(next, ContractJson.Options);
        }
    }

    /// <summary>Strict parse with the contract options (unknown members are rejected).</summary>
    public static UpdateProgramArgs ParseArgs(AIFunctionArguments arguments)
    {
        var obj = new JsonObject();
        foreach (var (key, value) in arguments)
        {
            var node = value switch
            {
                null => null,
                JsonElement e => JsonNode.Parse(e.GetRawText()),
                JsonNode n => n.DeepClone(),
                _ => JsonSerializer.SerializeToNode(value, value.GetType(), ToolJson),
            };
            // Some models send nested arrays as a JSON string; accept that.
            if (ListArgs.Contains(key) && node is JsonValue v && v.TryGetValue<string>(out var text))
            {
                try { node = JsonNode.Parse(text); }
                catch (JsonException) { /* leave it; deserialization reports the error */ }
            }
            obj[key] = node;
        }
        return obj.Deserialize<UpdateProgramArgs>(ContractJson.Options) ?? new UpdateProgramArgs();
    }
}

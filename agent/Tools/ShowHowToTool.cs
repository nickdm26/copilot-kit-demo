using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Agents;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.Tools;

/// <summary>
/// The showHowTo backend tool (declarative generative UI). Its only argument, <c>ui</c>, is a JSON tree built from a
/// fixed catalog of web components. The tool checks the tree with <see cref="HowToValidator"/> so the model gets an error
/// to fix; the web app renders the call's args and validates them again (web/src/components/declarative/schema.ts, the
/// security boundary). The model never sends HTML, CSS or code.
/// </summary>
public sealed class ShowHowToTool(ILogger<ShowHowToTool> logger) : AIFunction
{
    public const string ErrorPrefix = "Error:";
    public const string ShownResult = "Shown to the trainer in the chat.";

    public override string Name => ToolNames.ShowHowTo;

    public override string Description => """
        Show the trainer a step-by-step how-to for one exercise in the chat, built only from a fixed catalog of components.
        Use it when the trainer asks how to do a lift or asks to see one, e.g. "Show me a pause squat". The lift does not need to be in the exercise library.
        "ui" is a tree of catalog nodes. Every node has "type" plus only the props listed:
        - Card { children: node[] }: container. Use one Card as the root.
        - Heading { text, meta? }: the exercise name; meta is a short note on the right, e.g. "Tempo 3-2-X".
        - Stepper { steps: [{ title, cue, figure?, tempoBox? }] }: 3 to 8 steps the trainer clicks through, one coaching cue each: setup, brace, each phase of the rep, the key form points. At most one Stepper.
          figure takes the same props as PoseFigure (without "type").
          tempoBox is the TempoStrip box (1 = the first) that lights up during this step. Leave it out for steps outside the tempo, such as the setup.
        - PoseFigure { lift?, pose, marker?, view?, focus?, flag? }: a preset stick figure. It cannot draw anything else.
          lift picks the figure: "squat" (bar on the back; also front, goblet and pause squats, lunges), "deadlift" (any hip hinge: deadlift, RDL, good morning), "bench" (lying on a bench: bench press, dumbbell press), "overhead" (standing overhead press), "row" (bent-over row) or "curl" (standing curl). Missing means "squat", so always set it for other lifts, and use the same lift in every figure.
          pose is where the weight is: "stand" = top of the rep (lockout), "half" = halfway, "bottom" = lowest point (bar on the floor, on the chest, at the shoulders for a press, arms long for a row or curl).
          marker is the weight's direction: "down", "hold" or "up".
          view is the camera: "side" (the default: depth, back angle, bar path), "front" (stance and grip width, knees tracking over the toes, left and right) or "angle" (45 degrees, some of both). A step without view keeps the view of the step before. Change the view when a cue is easier to see from another side.
          focus rings one body part to watch, in orange: "head", "shoulder", "elbow", "hand", "chest", "back", "hip", "knee" or "foot" (both sides).
          flag { part, side? } rings a body part in red for the client's injury, e.g. { "part": "shoulder", "side": "left" }. side is "left" or "right", the client's own side; leave it out for both. A flag with a side shows best in the front view.
          If no lift fits (e.g. a pull-up or a plank), leave every figure out rather than draw the wrong one.
        - TempoStrip { segments: string[], follows?: "Stepper" }: about 3 short tempo boxes such as "3s down", "2s pause", "Up fast". With follows "Stepper", each step's tempoBox lights up its box.
        - Callout { tone, text }: a tinted note. tone is "ok", "flag" or "info".
        No other types or props. No HTML, markdown, styles, URLs or code. At most 4 levels deep and 50 nodes. Keep every text short.
        Personalise it from the client profile: when the client has an injury that matters for this lift, flag that body part on the figures where it is under load, and end with a "flag" Callout that names it, e.g. "For Sarah: left shoulder. Wider grip, elbows down."
        After the call, reply with one short sentence at most.
        """;

    public override JsonElement JsonSchema => Schema;

    protected override ValueTask<object?> InvokeCoreAsync(AIFunctionArguments arguments, CancellationToken cancellationToken)
    {
        var errors = new List<string>();
        foreach (var key in arguments.Keys)
            if (key != "ui") errors.Add($"unknown argument '{key}' (only 'ui')");

        if (!arguments.TryGetValue("ui", out var raw) || raw is null) errors.Add("'ui' is required");
        else errors.AddRange(ValidateArg(raw));

        if (errors.Count == 0) return ValueTask.FromResult<object?>(ShownResult);
        logger.LogInformation("showHowTo rejected a tree: {Errors}", string.Join("; ", errors));
        return ValueTask.FromResult<object?>(
            $"{ErrorPrefix} {string.Join("; ", errors.Take(6))}. Nothing was shown; fix these and call {ToolNames.ShowHowTo} again.");
    }

    // No reflection-based serialization here: JsonNode and strings go through text.
    private static IReadOnlyList<string> ValidateArg(object value) => value switch
    {
        JsonElement e => HowToValidator.Validate(e),
        JsonNode n => HowToValidator.ValidateJson(n.ToJsonString()),
        string s => HowToValidator.ValidateJson(s),
        _ => ["'ui' must be a JSON object"],
    };

    // The model-facing schema. Cards are unrolled two levels (no $ref) because some providers reject recursive schemas.
    // HowToValidator is the real rule set; this only guides the model.
    private static readonly JsonElement Schema = BuildSchema();

    private static JsonElement BuildSchema()
    {
        static JsonObject Str(int max, string? description = null)
        {
            var o = new JsonObject { ["type"] = "string", ["maxLength"] = max };
            if (description is not null) o["description"] = description;
            return o;
        }
        static JsonArray Enum(params string[] values) => new(values.Select(v => (JsonNode)JsonValue.Create(v)).ToArray());
        static JsonObject Node(string type, JsonObject props, params string[] required)
        {
            props["type"] = new JsonObject { ["type"] = "string", ["enum"] = Enum(type) };
            return new JsonObject
            {
                ["type"] = "object",
                ["properties"] = props,
                ["required"] = new JsonArray(new[] { "type" }.Concat(required).Select(r => (JsonNode)JsonValue.Create(r)).ToArray()),
                ["additionalProperties"] = false,
            };
        }
        static JsonObject OneOf(string[] values) => new() { ["type"] = "string", ["enum"] = Enum(values) };
        static JsonObject FigureProps() => new()
        {
            ["lift"] = OneOf(HowToValidator.Lifts),
            ["pose"] = OneOf(HowToValidator.Poses),
            ["marker"] = OneOf(HowToValidator.Markers),
            ["view"] = OneOf(HowToValidator.Views),
            ["focus"] = OneOf(HowToValidator.BodyParts),
            ["flag"] = new JsonObject
            {
                ["type"] = "object",
                ["properties"] = new JsonObject
                {
                    ["part"] = OneOf(HowToValidator.BodyParts),
                    ["side"] = OneOf(HowToValidator.Sides),
                },
                ["required"] = new JsonArray("part"),
                ["additionalProperties"] = false,
            },
        };
        static JsonObject Figure() => new()
        {
            ["type"] = "object",
            ["properties"] = FigureProps(),
            ["required"] = new JsonArray("pose"),
            ["additionalProperties"] = false,
        };
        static JsonArray Leaves() =>
        [
            Node("Heading", new JsonObject { ["text"] = Str(80), ["meta"] = Str(40) }, "text"),
            Node("Stepper", new JsonObject
            {
                ["steps"] = new JsonObject
                {
                    ["type"] = "array",
                    ["minItems"] = 1,
                    ["maxItems"] = HowToValidator.MaxSteps,
                    ["items"] = new JsonObject
                    {
                        ["type"] = "object",
                        ["properties"] = new JsonObject
                        {
                            ["title"] = Str(60),
                            ["cue"] = Str(160),
                            ["figure"] = Figure(),
                            ["tempoBox"] = new JsonObject
                            {
                                ["type"] = "integer", ["minimum"] = 1, ["maximum"] = HowToValidator.MaxSegments,
                            },
                        },
                        ["required"] = new JsonArray("title", "cue"),
                        ["additionalProperties"] = false,
                    },
                },
            }, "steps"),
            Node("PoseFigure", FigureProps(), "pose"),
            Node("TempoStrip", new JsonObject
            {
                ["segments"] = new JsonObject
                {
                    ["type"] = "array", ["minItems"] = 1, ["maxItems"] = HowToValidator.MaxSegments, ["items"] = Str(24),
                },
                ["follows"] = OneOf(["Stepper"]),
            }, "segments"),
            Node("Callout", new JsonObject
            {
                ["tone"] = OneOf(HowToValidator.Tones),
                ["text"] = Str(280),
            }, "tone", "text"),
        ];
        static JsonObject Card(JsonArray childOptions) => Node("Card", new JsonObject
        {
            ["children"] = new JsonObject
            {
                ["type"] = "array", ["minItems"] = 1, ["maxItems"] = HowToValidator.MaxChildren,
                ["items"] = new JsonObject { ["anyOf"] = childOptions },
            },
        }, "children");

        var inner = Card(Leaves());
        var rootChildren = Leaves();
        rootChildren.Add(inner);
        var root = Card(rootChildren);
        root["description"] = "The how-to tree. The root is a Card.";

        var schema = new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject { ["ui"] = root },
            ["required"] = new JsonArray("ui"),
            ["additionalProperties"] = false,
        };
        using var doc = JsonDocument.Parse(schema.ToJsonString());
        return doc.RootElement.Clone();
    }
}

/// <summary>
/// Strict checks for a how-to tree. Mirrors validateHowTo in web/src/components/declarative/schema.ts; keep them in step.
/// A null optional prop counts as absent (some models send them).
/// </summary>
public static class HowToValidator
{
    public const int MaxDepth = 4;
    public const int MaxNodes = 50;
    public const int MaxJsonChars = 20_000;
    public const int MaxChildren = 20;
    public const int MaxSteps = 8;
    public const int MaxSegments = 6;

    public static readonly string[] Types = ["Card", "Heading", "Stepper", "PoseFigure", "TempoStrip", "Callout"];
    public static readonly string[] Lifts = ["squat", "deadlift", "bench", "overhead", "row", "curl"];
    public static readonly string[] Poses = ["stand", "half", "bottom"];
    public static readonly string[] Markers = ["down", "hold", "up"];
    public static readonly string[] Views = ["side", "front", "angle"];
    public static readonly string[] BodyParts = ["head", "shoulder", "elbow", "hand", "chest", "back", "hip", "knee", "foot"];
    public static readonly string[] Sides = ["left", "right"];
    public static readonly string[] Tones = ["ok", "flag", "info"];

    private static readonly string[] FigureProps = ["lift", "pose", "marker", "view", "focus", "flag"];

    private static readonly Dictionary<string, string[]> Props = new()
    {
        ["Card"] = ["children"],
        ["Heading"] = ["text", "meta"],
        ["Stepper"] = ["steps"],
        ["PoseFigure"] = FigureProps,
        ["TempoStrip"] = ["segments", "follows"],
        ["Callout"] = ["tone", "text"],
    };

    /// <summary>Returns the problems found; empty means the tree is valid. Accepts the tree or a JSON string of it.</summary>
    public static IReadOnlyList<string> Validate(JsonElement ui)
    {
        if (ui.ValueKind == JsonValueKind.String) return ValidateJson(ui.GetString()!);
        if (ui.GetRawText().Length > MaxJsonChars) return [$"'ui' is larger than {MaxJsonChars} characters"];

        var ctx = new Context();
        CheckNode(ui, "ui", 1, ctx);
        if (ctx.MaxDepth > MaxDepth) ctx.Errors.Add($"the tree is deeper than {MaxDepth} levels");
        if (ctx.Nodes > MaxNodes) ctx.Errors.Add($"the tree has more than {MaxNodes} nodes");
        if (ctx.Steppers > 1) ctx.Errors.Add("use at most one Stepper");
        // A step's tempoBox must point at a real box of every TempoStrip that follows the Stepper.
        if (ctx.FollowerBoxes.Count > 0 && ctx.MaxTempoBox > ctx.FollowerBoxes.Min())
            ctx.Errors.Add($"a step has tempoBox {ctx.MaxTempoBox} but the TempoStrip has {ctx.FollowerBoxes.Min()} boxes");
        return ctx.Errors;
    }

    /// <summary>Validate a tree given as JSON text (some models send nested objects as a string).</summary>
    public static IReadOnlyList<string> ValidateJson(string json)
    {
        if (json.Length > MaxJsonChars) return [$"'ui' is larger than {MaxJsonChars} characters"];
        try
        {
            using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 32 });
            // A string holding a string is not a tree; don't unwrap twice.
            return doc.RootElement.ValueKind == JsonValueKind.String
                ? ["'ui' must be a JSON object"]
                : Validate(doc.RootElement.Clone());
        }
        catch (JsonException)
        {
            return ["'ui' is not valid JSON"];
        }
    }

    private sealed class Context
    {
        public List<string> Errors { get; } = [];
        public int Nodes;
        public int MaxDepth;
        public int Steppers;
        /// <summary>Highest tempoBox on any step.</summary>
        public int MaxTempoBox;
        /// <summary>Box counts of the TempoStrips that follow the Stepper.</summary>
        public List<int> FollowerBoxes { get; } = [];
    }

    private static void CheckNode(JsonElement node, string path, int depth, Context ctx)
    {
        // Stop walking once the limits are blown; the summary errors cover it.
        if (depth > MaxDepth + 1 || ctx.Nodes > MaxNodes) { ctx.MaxDepth = Math.Max(ctx.MaxDepth, depth); return; }
        if (node.ValueKind != JsonValueKind.Object) { ctx.Errors.Add($"{path}: must be an object"); return; }
        ctx.Nodes++;
        ctx.MaxDepth = Math.Max(ctx.MaxDepth, depth);

        var type = Get(node, "type");
        if (type is not { ValueKind: JsonValueKind.String } || !Types.Contains(type.Value.GetString()))
        {
            ctx.Errors.Add($"{path}.type: not a catalog type (allowed: {string.Join(", ", Types)})");
            return;
        }
        var name = type.Value.GetString()!;
        foreach (var prop in node.EnumerateObject())
            if (prop.Name != "type" && !Props[name].Contains(prop.Name) && prop.Value.ValueKind != JsonValueKind.Null)
                ctx.Errors.Add($"{path}: {name} has no prop '{prop.Name}'");

        switch (name)
        {
            case "Card":
                var children = Items(node, "children", path, 1, MaxChildren, ctx);
                for (var i = 0; i < children.Count; i++) CheckNode(children[i], $"{path}.children.{i}", depth + 1, ctx);
                break;
            case "Heading":
                Text(node, "text", 80, required: true, path, ctx);
                Text(node, "meta", 40, required: false, path, ctx);
                break;
            case "Stepper":
                ctx.Steppers++;
                var steps = Items(node, "steps", path, 1, MaxSteps, ctx);
                for (var i = 0; i < steps.Count; i++) CheckStep(steps[i], $"{path}.steps.{i}", ctx);
                break;
            case "PoseFigure":
                CheckFigure(node, path, ctx, allowType: true);
                break;
            case "TempoStrip":
                var segments = Items(node, "segments", path, 1, MaxSegments, ctx);
                for (var i = 0; i < segments.Count; i++)
                    CheckText(segments[i], 24, $"{path}.segments.{i}", ctx);
                OneOf(node, "follows", ["Stepper"], required: false, path, ctx);
                if (Get(node, "follows") is { ValueKind: JsonValueKind.String } follows && follows.GetString() == "Stepper")
                    ctx.FollowerBoxes.Add(segments.Count);
                break;
            case "Callout":
                OneOf(node, "tone", Tones, required: true, path, ctx);
                Text(node, "text", 280, required: true, path, ctx);
                break;
        }
    }

    private static void CheckStep(JsonElement step, string path, Context ctx)
    {
        if (step.ValueKind != JsonValueKind.Object) { ctx.Errors.Add($"{path}: must be an object"); return; }
        foreach (var prop in step.EnumerateObject())
            if (prop.Name is not ("title" or "cue" or "figure" or "tempoBox") && prop.Value.ValueKind != JsonValueKind.Null)
                ctx.Errors.Add($"{path}: a step has no prop '{prop.Name}'");
        Text(step, "title", 60, required: true, path, ctx);
        Text(step, "cue", 160, required: true, path, ctx);
        if (Get(step, "figure") is { } figure)
        {
            if (figure.ValueKind != JsonValueKind.Object) ctx.Errors.Add($"{path}.figure: must be an object");
            else CheckFigure(figure, $"{path}.figure", ctx, allowType: false);
        }
        if (Get(step, "tempoBox") is { } box)
        {
            // Whole numbers only, as zod's .int() (2.0 is fine, 1.5 and "1" are not).
            if (box.ValueKind != JsonValueKind.Number || !box.TryGetDouble(out var n) || n != Math.Floor(n) || n < 1 || n > MaxSegments)
                ctx.Errors.Add($"{path}.tempoBox: must be a whole number from 1 to {MaxSegments}");
            else ctx.MaxTempoBox = Math.Max(ctx.MaxTempoBox, (int)n);
        }
    }

    private static void CheckFigure(JsonElement figure, string path, Context ctx, bool allowType)
    {
        if (!allowType)
            foreach (var prop in figure.EnumerateObject())
                if (!FigureProps.Contains(prop.Name) && prop.Value.ValueKind != JsonValueKind.Null)
                    ctx.Errors.Add($"{path}: a figure has no prop '{prop.Name}'");
        OneOf(figure, "lift", Lifts, required: false, path, ctx);
        OneOf(figure, "pose", Poses, required: true, path, ctx);
        OneOf(figure, "marker", Markers, required: false, path, ctx);
        OneOf(figure, "view", Views, required: false, path, ctx);
        OneOf(figure, "focus", BodyParts, required: false, path, ctx);
        if (Get(figure, "flag") is { } flag)
        {
            if (flag.ValueKind != JsonValueKind.Object)
            {
                ctx.Errors.Add($"{path}.flag: must be an object like {{ \"part\": \"shoulder\", \"side\": \"left\" }}");
                return;
            }
            foreach (var prop in flag.EnumerateObject())
                if (prop.Name is not ("part" or "side") && prop.Value.ValueKind != JsonValueKind.Null)
                    ctx.Errors.Add($"{path}.flag: a flag has no prop '{prop.Name}'");
            OneOf(flag, "part", BodyParts, required: true, $"{path}.flag", ctx);
            OneOf(flag, "side", Sides, required: false, $"{path}.flag", ctx);
        }
    }

    /// <summary>The property, or null when it is missing or JSON null.</summary>
    private static JsonElement? Get(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v : null;

    private static List<JsonElement> Items(JsonElement obj, string name, string path, int min, int max, Context ctx)
    {
        if (Get(obj, name) is not { ValueKind: JsonValueKind.Array } arr)
        {
            ctx.Errors.Add($"{path}.{name}: must be an array");
            return [];
        }
        var items = arr.EnumerateArray().ToList();
        if (items.Count < min || items.Count > max) ctx.Errors.Add($"{path}.{name}: needs {min} to {max} items");
        return items.Take(max).ToList();
    }

    private static void Text(JsonElement obj, string name, int max, bool required, string path, Context ctx)
    {
        if (Get(obj, name) is { } v) CheckText(v, max, $"{path}.{name}", ctx);
        else if (required) ctx.Errors.Add($"{path}.{name}: is required");
    }

    private static void CheckText(JsonElement v, int max, string path, Context ctx)
    {
        if (v.ValueKind != JsonValueKind.String) { ctx.Errors.Add($"{path}: must be a string"); return; }
        var s = v.GetString()!.Trim();
        if (s.Length == 0 || s.Length > max) ctx.Errors.Add($"{path}: must be 1 to {max} characters");
    }

    private static void OneOf(JsonElement obj, string name, string[] allowed, bool required, string path, Context ctx)
    {
        if (Get(obj, name) is not { } v)
        {
            if (required) ctx.Errors.Add($"{path}.{name}: is required");
            return;
        }
        if (v.ValueKind != JsonValueKind.String || !allowed.Contains(v.GetString()))
            ctx.Errors.Add($"{path}.{name}: must be one of {string.Join(", ", allowed)}");
    }
}

/// <summary>Adds showHowTo to every model's agent.</summary>
public sealed class HowToExtension(ILogger<ShowHowToTool> logger) : ICoachAgentExtension
{
    private readonly ShowHowToTool tool = new(logger);

    public IEnumerable<AITool> GetTools(string modelKey) => [tool];
}

public static class HowToServiceCollectionExtensions
{
    /// <summary>Registers the showHowTo backend tool (declarative how-to).</summary>
    public static IServiceCollection AddHowTo(this IServiceCollection services) =>
        services.AddSingleton<ICoachAgentExtension, HowToExtension>();
}

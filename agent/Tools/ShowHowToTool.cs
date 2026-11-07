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
        - Stepper { steps: [{ title, cue, figure?: { pose, marker? } }] }: 3 to 5 steps the trainer clicks through. At most one Stepper.
        - PoseFigure { pose, marker? }: a preset stick figure. pose is "stand", "half" or "bottom"; marker is "down", "hold" or "up". It cannot draw anything else.
        - TempoStrip { segments: string[], follows?: "Stepper" }: about 3 short tempo boxes such as "3s down", "2s pause", "Up fast". With follows "Stepper", box 1 lights up on step 2, box 2 on step 3, and so on.
        - Callout { tone, text }: a tinted note. tone is "ok", "flag" or "info".
        No other types or props. No HTML, markdown, styles, URLs or code. At most 4 levels deep and 50 nodes. Keep every text short.
        Personalise it from the client profile: when the client has an injury that matters for this lift, end with a "flag" Callout that names it, e.g. "For Sarah: left shoulder. Wider grip, elbows down."
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
        static JsonObject Figure() => new()
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["pose"] = new JsonObject { ["type"] = "string", ["enum"] = Enum(HowToValidator.Poses) },
                ["marker"] = new JsonObject { ["type"] = "string", ["enum"] = Enum(HowToValidator.Markers) },
            },
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
                        ["properties"] = new JsonObject { ["title"] = Str(60), ["cue"] = Str(160), ["figure"] = Figure() },
                        ["required"] = new JsonArray("title", "cue"),
                        ["additionalProperties"] = false,
                    },
                },
            }, "steps"),
            Node("PoseFigure", new JsonObject
            {
                ["pose"] = new JsonObject { ["type"] = "string", ["enum"] = Enum(HowToValidator.Poses) },
                ["marker"] = new JsonObject { ["type"] = "string", ["enum"] = Enum(HowToValidator.Markers) },
            }, "pose"),
            Node("TempoStrip", new JsonObject
            {
                ["segments"] = new JsonObject
                {
                    ["type"] = "array", ["minItems"] = 1, ["maxItems"] = HowToValidator.MaxSegments, ["items"] = Str(24),
                },
                ["follows"] = new JsonObject { ["type"] = "string", ["enum"] = Enum("Stepper") },
            }, "segments"),
            Node("Callout", new JsonObject
            {
                ["tone"] = new JsonObject { ["type"] = "string", ["enum"] = Enum(HowToValidator.Tones) },
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
    public static readonly string[] Poses = ["stand", "half", "bottom"];
    public static readonly string[] Markers = ["down", "hold", "up"];
    public static readonly string[] Tones = ["ok", "flag", "info"];

    private static readonly Dictionary<string, string[]> Props = new()
    {
        ["Card"] = ["children"],
        ["Heading"] = ["text", "meta"],
        ["Stepper"] = ["steps"],
        ["PoseFigure"] = ["pose", "marker"],
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
            if (prop.Name is not ("title" or "cue" or "figure") && prop.Value.ValueKind != JsonValueKind.Null)
                ctx.Errors.Add($"{path}: a step has no prop '{prop.Name}'");
        Text(step, "title", 60, required: true, path, ctx);
        Text(step, "cue", 160, required: true, path, ctx);
        if (Get(step, "figure") is { } figure)
        {
            if (figure.ValueKind != JsonValueKind.Object) ctx.Errors.Add($"{path}.figure: must be an object");
            else CheckFigure(figure, $"{path}.figure", ctx, allowType: false);
        }
    }

    private static void CheckFigure(JsonElement figure, string path, Context ctx, bool allowType)
    {
        if (!allowType)
            foreach (var prop in figure.EnumerateObject())
                if (prop.Name is not ("pose" or "marker") && prop.Value.ValueKind != JsonValueKind.Null)
                    ctx.Errors.Add($"{path}: a figure has no prop '{prop.Name}'");
        OneOf(figure, "pose", Poses, required: true, path, ctx);
        OneOf(figure, "marker", Markers, required: false, path, ctx);
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

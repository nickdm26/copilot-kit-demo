using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using PtCoach.Agent.Agents;
using PtCoach.Agent.Chat;
using PtCoach.Agent.Models;
using PtCoach.Agent.Seed;
using PtCoach.Agent.Telemetry;
using PtCoach.Agent.Tools;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.Services.AddAGUIServer(); // AG-UI JSON types; without it tool-call args can serialize as {}

builder.Services.Configure<OpenRouterOptions>(builder.Configuration.GetSection("OpenRouter"));
builder.Services.Configure<ReplayOptions>(builder.Configuration.GetSection("Replay"));

// Models allowlist, kept in config order. .NET configuration sorts child keys, so take the order from
// appsettings.json itself; keys only set elsewhere (tests, env vars) go last.
var appsettingsPath = Path.Combine(builder.Environment.ContentRootPath, "appsettings.json");
var fileOrder = File.Exists(appsettingsPath)
    && System.Text.Json.JsonDocument.Parse(File.ReadAllText(appsettingsPath)).RootElement.TryGetProperty("Models", out var modelsJson)
    ? modelsJson.EnumerateObject().Select(p => p.Name).ToList()
    : [];
var models = new ModelsOptions();
foreach (var section in builder.Configuration.GetSection("Models").GetChildren()
    .OrderBy(s => fileOrder.IndexOf(s.Key) is var i && i >= 0 ? i : int.MaxValue))
{
    var label = section["Label"] ?? section["label"];
    var modelId = section["ModelId"] ?? section["modelId"];
    if (string.IsNullOrWhiteSpace(label) || string.IsNullOrWhiteSpace(modelId))
    {
        throw new InvalidOperationException($"Models:{section.Key} needs both 'label' and 'modelId'.");
    }
    if (!System.Text.RegularExpressions.Regex.IsMatch(section.Key, "^[a-z][a-z0-9-]*$"))
    {
        throw new InvalidOperationException($"Model key '{section.Key}' must match ^[a-z][a-z0-9-]*$.");
    }
    models.Items.Add((section.Key, new ModelConfig { Label = label, ModelId = modelId }));
}
builder.Services.AddSingleton(models);

builder.Services.AddSingleton(sp =>
    new SeedStore(builder.Configuration["Seed:Directory"] ?? Path.Combine(AppContext.BaseDirectory, "Seed")));
builder.Services.AddSingleton<CoachTools>();
builder.Services.AddSingleton<IChatClientFactory, OpenRouterChatClientFactory>();
builder.Services.AddSingleton<CoachAgentBuilder>();
builder.Services.AddProgramState(); // Lane F: updateProgram + shared program state (CONTRACTS section 9, Plan A)
builder.Services.Configure<TelemetryOptions>(builder.Configuration.GetSection(TelemetryOptions.SectionName));

var app = builder.Build();
app.MapDefaultEndpoints();
app.UseMiddleware<RootSpanMiddleware>();

app.MapGet("/models", (ModelsOptions m) =>
    Results.Json(
        m.Items.Select(i => new ModelOption(i.Key, i.Config.Label, i.Config.ModelId)).ToList(),
        ContractJson.Options));

var coach = app.Services.GetRequiredService<CoachAgentBuilder>();
foreach (var (key, _) in models.Items)
{
    app.MapAGUIServer($"/agent/{key}", coach.Build(key))
        .WithMetadata(coach.BuildStreamOptions(key));
}

app.Run();

public partial class Program;

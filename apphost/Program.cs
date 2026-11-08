var builder = DistributedApplication.CreateBuilder(args);

// Resource names are also the OpenTelemetry service names (CONTRACTS section 5).
// The agent has no launch profile, so set Development explicitly: user secrets (the OpenRouter key) only load there.
var agent = builder.AddProject<Projects.PtCoach_Agent>("agent")
    .WithHttpEndpoint(name: "http")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
    // Local dev only: put prompts, responses and tool arguments/results on the GenAI spans for the dashboard.
    // The agent's own default (Telemetry:CaptureContent) stays off.
    .WithEnvironment("Telemetry__CaptureContent", "true");

var runtime = builder.AddJavaScriptApp("runtime", "../runtime") // runs the "dev" script
    .WithYarn()
    .WithHttpEndpoint(env: "PORT")
    .WithEnvironment("AGENT_URL", agent.GetEndpoint("http"))
    .WaitFor(agent);

// AddViteApp registers its own http endpoint and sets PORT; do not add one.
builder.AddViteApp("web", "../web") // runs the "dev" script
    .WithYarn()
    .WithEnvironment("AGENT_URL", agent.GetEndpoint("http"))
    .WithEnvironment("RUNTIME_URL", runtime.GetEndpoint("http"))
    // Aspire sets NODE_ENV from the AppHost's own environment, and `aspire run` starts the AppHost without a launch
    // profile, so it would be "production". Vite bakes that into the dependency bundle, which switches off React's
    // development build and CopilotKit's Web Inspector (it requires NODE_ENV === "development"). This is a local dev
    // host, so pin it. See CONTRACTS section 5.
    .WithEnvironment("NODE_ENV", "development")
    .WaitFor(runtime);

builder.Build().Run();

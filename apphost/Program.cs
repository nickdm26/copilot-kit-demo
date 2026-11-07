var builder = DistributedApplication.CreateBuilder(args);

// Resource names are also the OpenTelemetry service names (CONTRACTS section 5).
// The agent has no launch profile, so set Development explicitly: user secrets (the OpenRouter key) only load there.
var agent = builder.AddProject<Projects.PtCoach_Agent>("agent")
    .WithHttpEndpoint(name: "http")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development");

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
    .WaitFor(runtime);

builder.Build().Run();

using AGUI.Server;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using PtCoach.Agent.Chat;
using PtCoach.Agent.Telemetry;
using PtCoach.Agent.Tools;

namespace PtCoach.Agent.Agents;

/// <summary>
/// Extension point for later lanes. Register implementations in DI; every one is applied to every model's agent.
/// Lane F (Phase 2) uses it to add the updateProgram backend tool, a DelegatingAIAgent that injects the
/// client-sent ProgramState, and AGUIStreamOptions.MapResultAsStateSnapshot("updateProgram").
/// </summary>
public interface ICoachAgentExtension
{
    /// <summary>Extra backend tools for this model's agent.</summary>
    IEnumerable<AITool> GetTools(string modelKey) => [];

    /// <summary>Wrap the finished agent (e.g. DelegatingAIAgent). Extensions apply in registration order.</summary>
    AIAgent Wrap(string modelKey, AIAgent agent) => agent;

    /// <summary>Adjust the AG-UI stream options attached to this model's endpoint as metadata.</summary>
    void ConfigureStream(string modelKey, AGUIStreamOptions options) { }
}

public sealed class CoachAgentBuilder(
    IChatClientFactory chatClients,
    CoachTools coachTools,
    IEnumerable<ICoachAgentExtension> extensions,
    ILoggerFactory loggerFactory,
    IOptions<TelemetryOptions> telemetry,
    IServiceProvider services)
{
    public const string AgentTelemetrySource = "Experimental.Microsoft.Agents.AI";

    public AIAgent Build(string modelKey)
    {
        var tools = coachTools.CreateAll().ToList();
        foreach (var ext in extensions) tools.AddRange(ext.GetTools(modelKey));

        // Already instrumented (OpenTelemetryChatClient). Without a key it's a stub that fails the run, so the app still starts.
        var chat = chatClients.Create(modelKey);
        AIAgent agent = chat.AsAIAgent(
            new ChatClientAgentOptions
            {
                Name = $"coach-{modelKey}",
                Description = "PT Coach",
                ChatOptions = new ChatOptions { Instructions = CoachPrompt.Instructions, Tools = tools },
                // Approval binding only honours approvals recorded in a server-side session, but CopilotKit replays the
                // whole history each run, so a proposeSwap answer was dropped and the run failed. None of our backend
                // tools needs approval (the client can set program state directly anyway), so binding guards nothing here.
                DisableApprovalResponseBinding = true,
            },
            loggerFactory: loggerFactory,
            services: services);

        // EnableSensitiveData also flows to the chat client this layer auto-wires under the function-invoking client,
        // which is where execute_tool spans get their arguments and results. Off unless Telemetry:CaptureContent is set.
        agent = agent.AsBuilder()
            .UseOpenTelemetry(AgentTelemetrySource, c => c.EnableSensitiveData = telemetry.Value.CaptureContent)
            .Build();
        foreach (var ext in extensions) agent = ext.Wrap(modelKey, agent);
        return agent;
    }

    public AGUIStreamOptions BuildStreamOptions(string modelKey)
    {
        var options = new AGUIStreamOptions();
        foreach (var ext in extensions) ext.ConfigureStream(modelKey, options);
        return options;
    }
}

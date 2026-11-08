using AGUI.Abstractions;
using AGUI.Server;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using PtCoach.Agent.Agents;
using PtCoach.Agent.Chat;
using PtCoach.Agent.Seed;
using PtCoach.Agent.State;
using PtCoach.Agent.Subagents;
using PtCoach.Agent.Telemetry;
using PtCoach.Agent.Tools;

namespace PtCoach.Agent.Subagents
{
    /// <summary>
    /// Parallel sub-agents (CONTRACTS section 11). Register it last: its wrapper must be the outermost, so the merged
    /// event channel sits between every other layer and the AG-UI host.
    /// </summary>
    public sealed class SubagentExtension(
        SubagentHub hub,
        ProgramStateStore programs,
        IChatClientFactory chatClients,
        CoachTools coachTools,
        SeedStore seed,
        ILoggerFactory loggerFactory,
        IOptions<TelemetryOptions> telemetry) : ICoachAgentExtension
    {
        public AIAgent Wrap(string modelKey, AIAgent agent)
        {
            // Sub-agents run on the coach's own model. Its own client instance, so replay keeps separate turn counters.
            var updateProgram = new UpdateProgramTool(programs, loggerFactory.CreateLogger<UpdateProgramTool>());
            var runner = new SubagentRunner(chatClients.Create(modelKey), coachTools, seed, updateProgram, loggerFactory, telemetry);
            var tool = new RunSubagentsTool(hub, runner, seed, programs, loggerFactory.CreateLogger<RunSubagentsTool>());
            return new SubagentStreamAgent(agent, tool, hub, programs);
        }

        /// <summary>Puts the sub-agents' ready-made events on the wire as they are.</summary>
        public void ConfigureStream(string modelKey, AGUIStreamOptions options) =>
            options.MapContent(content => content is AguiEventContent e ? [e.Event] : null);
    }
}

namespace Microsoft.Extensions.DependencyInjection
{
    public static class SubagentServiceCollectionExtensions
    {
        /// <summary>Registers parallel sub-agents. Call after every other <see cref="ICoachAgentExtension"/>.</summary>
        public static IServiceCollection AddSubagents(this IServiceCollection services)
        {
            services.AddSingleton<SubagentHub>();
            services.AddSingleton<ICoachAgentExtension, SubagentExtension>();
            // The AG-UI host serializes every update into rawEvent; AIContent is polymorphic, so the custom
            // content type needs a discriminator there or the run fails with "Runtime type ... is not supported".
            services.ConfigureHttpJsonOptions(o =>
                o.SerializerOptions.AddAIContentType(typeof(AguiEventContent), AguiEventContent.TypeDiscriminator));
            return services;
        }
    }
}

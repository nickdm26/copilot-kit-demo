using AGUI.Server;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Agents;
using PtCoach.Agent.Models;
using PtCoach.Agent.State;

namespace PtCoach.Agent.State
{
    /// <summary>
    /// Shared program state, Plan A (CONTRACTS section 9): the updateProgram backend tool, the state-reading wrapper,
    /// and <c>MapResultAsStateSnapshot("updateProgram")</c> so each result reaches the browser as STATE_SNAPSHOT.
    /// </summary>
    public sealed class ProgramStateExtension(ProgramStateStore store, ILoggerFactory loggerFactory) : ICoachAgentExtension
    {
        public IEnumerable<AITool> GetTools(string modelKey) =>
            [new UpdateProgramTool(store, loggerFactory.CreateLogger<UpdateProgramTool>())];

        public AIAgent Wrap(string modelKey, AIAgent agent) => new ProgramStateAgent(agent, store);

        public void ConfigureStream(string modelKey, AGUIStreamOptions options) =>
            options.MapResultAsStateSnapshot(ToolNames.UpdateProgram);
    }
}

namespace Microsoft.Extensions.DependencyInjection
{
    public static class ProgramStateServiceCollectionExtensions
    {
        /// <summary>Registers the shared program state (store + <see cref="ICoachAgentExtension"/>). Call before <c>builder.Build()</c>.</summary>
        public static IServiceCollection AddProgramState(this IServiceCollection services)
        {
            services.AddSingleton<ProgramStateStore>();
            services.AddSingleton<ICoachAgentExtension, ProgramStateExtension>();
            return services;
        }
    }
}

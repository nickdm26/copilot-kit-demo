using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text.Json;
using AGUI.Abstractions;
using AGUI.Server;
using Microsoft.Extensions.AI;
using PtCoach.Agent.Models;
using PtCoach.Agent.Seed;

namespace PtCoach.Agent.State;

/// <summary>The program for one AG-UI run. Seeded from the request state; every updateProgram call in the run updates it.</summary>
public sealed class ProgramWorkingCopy(ProgramState initial)
{
    public object Gate { get; } = new();

    /// <summary>Read and write under <see cref="Gate"/>.</summary>
    public ProgramState State { get; set; } = initial;
}

/// <summary>
/// Per-run working copies, keyed by the run's <see cref="RunAgentInput"/> instance (one per request), so
/// concurrent runs and threads never share a copy. Entries go away with the request.
/// </summary>
public sealed class ProgramStateStore
{
    public static readonly ActivitySource Activity = new("PtCoach.Agent.State");

    private readonly ConditionalWeakTable<RunAgentInput, ProgramWorkingCopy> _copies = new();
    private readonly ILogger<ProgramStateStore> logger;
    private readonly Lazy<IReadOnlySet<string>?> _exerciseIds;
    private readonly Lazy<IReadOnlySet<string>?> _clientIds;

    public ProgramStateStore(SeedStore seed, ILogger<ProgramStateStore> logger)
    {
        this.logger = logger;
        _exerciseIds = new(() => TrySeed(() => seed.Exercises.Select(e => e.Id).ToHashSet()));
        _clientIds = new(() => TrySeed(() => seed.Clients.Select(c => c.Id).ToHashSet()));
    }

    /// <summary>Seed exercise ids, or null when the seed files are missing (checks are then skipped).</summary>
    public IReadOnlySet<string>? ExerciseIds => _exerciseIds.Value;

    public IReadOnlySet<string>? ClientIds => _clientIds.Value;

    /// <summary>The working copy for the run that owns <paramref name="options"/>, or null outside an AG-UI run.</summary>
    public ProgramWorkingCopy? ForRun(ChatOptions? options) =>
        options is not null && options.TryGetRunAgentInput(out var input) && input is not null ? ForRun(input) : null;

    public ProgramWorkingCopy ForRun(RunAgentInput input) =>
        _copies.GetValue(input, i => new ProgramWorkingCopy(ReadClientState(i)));

    /// <summary>
    /// Reads RunAgentInput.State as a ProgramState. Client state is untrusted: anything that is not a valid
    /// ProgramState becomes the empty state (with a warning). An absent or empty-object state is simply "no program yet".
    /// </summary>
    public ProgramState ReadClientState(RunAgentInput input)
    {
        using var activity = Activity.StartActivity("program_state.read");
        activity?.SetTag("agui.thread_id", input.ThreadId);
        activity?.SetTag("agui.run_id", input.RunId);

        var state = Parse(input, out var problem);
        if (problem is not null)
        {
            logger.LogWarning("Run {RunId}: ignoring invalid client program state ({Problem}); starting from the empty program.",
                input.RunId, problem);
            activity?.SetTag("program.invalid", problem);
        }

        var cells = state.Weeks.Sum(w => w.Days.Sum(d => d.Exercises.Count));
        logger.LogInformation("Run {RunId} (thread {ThreadId}): program state for '{ClientId}' with {Weeks} weeks, {Cells} cells, {Flags} flags.",
            input.RunId, input.ThreadId, state.ClientId, state.Weeks.Count, cells, state.Flags.Count);
        activity?.SetTag("program.client_id", state.ClientId);
        activity?.SetTag("program.weeks", state.Weeks.Count);
        activity?.SetTag("program.cells", cells);
        // The program is fictional demo data, never a secret. Kept on the span so a run can be inspected in Aspire.
        activity?.SetTag("program.state", Truncate(JsonSerializer.Serialize(state, ContractJson.Options), 8000));
        return state;
    }

    private ProgramState Parse(RunAgentInput input, out string? problem)
    {
        problem = null;
        if (input.State is not JsonElement json ||
            json.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null ||
            (json.ValueKind == JsonValueKind.Object && !json.EnumerateObject().Any()))
        {
            return Empty();
        }

        ProgramState? state;
        try
        {
            state = json.Deserialize<ProgramState>(ContractJson.Options);
        }
        catch (JsonException ex)
        {
            problem = ex.Message;
            return Empty();
        }

        var errors = ProgramStateValidator.Validate(state, ExerciseIds, ClientIds);
        if (errors.Count > 0)
        {
            problem = string.Join("; ", errors.Take(5));
            return Empty();
        }
        return state!;
    }

    /// <summary>No program and no client yet; the first updateProgram call must set clientId.</summary>
    public static ProgramState Empty() => ProgramState.Empty("");

    private IReadOnlySet<string>? TrySeed(Func<HashSet<string>> load)
    {
        try
        {
            return load();
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning("Seed data unavailable, skipping id checks: {Message}", ex.Message);
            return null;
        }
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max] + "...";
}

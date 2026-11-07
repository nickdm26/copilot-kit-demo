using System.Text.Json;
using PtCoach.Agent.Models;

namespace PtCoach.Agent.Seed;

/// <summary>Loads exercises.json and clients.json lazily. Fails with a clear message only when used and the files are missing.</summary>
public sealed class SeedStore(string directory)
{
    private readonly Lazy<IReadOnlyList<Exercise>> _exercises = new(() => Load<Exercise>(directory, "exercises.json"));
    private readonly Lazy<IReadOnlyList<Client>> _clients = new(() => Load<Client>(directory, "clients.json"));

    public IReadOnlyList<Exercise> Exercises => _exercises.Value;

    public IReadOnlyList<Client> Clients => _clients.Value;

    public Client? FindClient(string id) =>
        Clients.FirstOrDefault(c => string.Equals(c.Id, id, StringComparison.OrdinalIgnoreCase));

    private static IReadOnlyList<T> Load<T>(string directory, string file)
    {
        var path = Path.Combine(directory, file);
        if (!File.Exists(path))
        {
            throw new InvalidOperationException(
                $"Seed file '{file}' was not found at '{path}'. It is written to shared/seed/ and copied to the agent output folder at build time.");
        }

        try
        {
            return JsonSerializer.Deserialize<List<T>>(File.ReadAllText(path), ContractJson.Options)
                ?? throw new InvalidOperationException($"Seed file '{path}' is empty.");
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"Seed file '{path}' does not match the contract shape: {ex.Message}", ex);
        }
    }
}

using PtCoach.Agent.Models;
using PtCoach.Agent.Seed;

namespace PtCoach.Agent.Tests;

// Loads the real shared/seed files (copied next to the agent build output) through the contract records.
public class RealSeedTests
{
    private static readonly SeedStore Store = new(Path.Combine(AppContext.BaseDirectory, "Seed"));

    [Fact]
    public void Real_seed_matches_contract_records()
    {
        Assert.InRange(Store.Exercises.Count, 35, 50);
        Assert.Equal(["priya", "sarah", "tom"], Store.Clients.Select(c => c.Id).Order().ToArray());
        Assert.Equal(ShoulderStress.High, Store.Exercises.Single(e => e.Id == "overhead-press").ShoulderStress);
        Assert.Contains(Store.FindClient("sarah")!.Injuries, i => i.Area == InjuryArea.Shoulder && i.Side == Side.Left);
    }
}

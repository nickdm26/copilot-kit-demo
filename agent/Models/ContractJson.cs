using System.Text.Json;
using System.Text.Json.Serialization;

namespace PtCoach.Agent.Models;

/// <summary>The one JSON setup for every contract type: camelCase, nulls omitted.</summary>
public static class ContractJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };
}

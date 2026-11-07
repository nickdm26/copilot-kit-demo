using System.Text.Json.Serialization;

namespace PtCoach.Agent.Models;

// Enum wire values match CONTRACTS.md and web/src/lib/contracts.ts exactly.

[JsonConverter(typeof(JsonStringEnumConverter<WeekDay>))]
public enum WeekDay
{
    [JsonStringEnumMemberName("Mon")] Mon,
    [JsonStringEnumMemberName("Tue")] Tue,
    [JsonStringEnumMemberName("Wed")] Wed,
    [JsonStringEnumMemberName("Thu")] Thu,
    [JsonStringEnumMemberName("Fri")] Fri,
    [JsonStringEnumMemberName("Sat")] Sat,
    [JsonStringEnumMemberName("Sun")] Sun,
}

[JsonConverter(typeof(JsonStringEnumConverter<Goal>))]
public enum Goal
{
    [JsonStringEnumMemberName("strength")] Strength,
    [JsonStringEnumMemberName("hypertrophy")] Hypertrophy,
    [JsonStringEnumMemberName("general")] General,
    [JsonStringEnumMemberName("endurance-support")] EnduranceSupport,
}

[JsonConverter(typeof(JsonStringEnumConverter<Muscle>))]
public enum Muscle
{
    [JsonStringEnumMemberName("chest")] Chest,
    [JsonStringEnumMemberName("back")] Back,
    [JsonStringEnumMemberName("shoulders")] Shoulders,
    [JsonStringEnumMemberName("biceps")] Biceps,
    [JsonStringEnumMemberName("triceps")] Triceps,
    [JsonStringEnumMemberName("quads")] Quads,
    [JsonStringEnumMemberName("hamstrings")] Hamstrings,
    [JsonStringEnumMemberName("glutes")] Glutes,
    [JsonStringEnumMemberName("calves")] Calves,
    [JsonStringEnumMemberName("core")] Core,
}

[JsonConverter(typeof(JsonStringEnumConverter<Pattern>))]
public enum Pattern
{
    [JsonStringEnumMemberName("squat")] Squat,
    [JsonStringEnumMemberName("hinge")] Hinge,
    [JsonStringEnumMemberName("lunge")] Lunge,
    [JsonStringEnumMemberName("horizontal-push")] HorizontalPush,
    [JsonStringEnumMemberName("vertical-push")] VerticalPush,
    [JsonStringEnumMemberName("horizontal-pull")] HorizontalPull,
    [JsonStringEnumMemberName("vertical-pull")] VerticalPull,
    [JsonStringEnumMemberName("carry")] Carry,
    [JsonStringEnumMemberName("core")] Core,
    [JsonStringEnumMemberName("isolation")] Isolation,
}

[JsonConverter(typeof(JsonStringEnumConverter<Equipment>))]
public enum Equipment
{
    [JsonStringEnumMemberName("barbell")] Barbell,
    [JsonStringEnumMemberName("dumbbell")] Dumbbell,
    [JsonStringEnumMemberName("kettlebell")] Kettlebell,
    [JsonStringEnumMemberName("cable")] Cable,
    [JsonStringEnumMemberName("machine")] Machine,
    [JsonStringEnumMemberName("bodyweight")] Bodyweight,
    [JsonStringEnumMemberName("band")] Band,
    [JsonStringEnumMemberName("trap-bar")] TrapBar,
}

[JsonConverter(typeof(JsonStringEnumConverter<ShoulderStress>))]
public enum ShoulderStress
{
    [JsonStringEnumMemberName("low")] Low,
    [JsonStringEnumMemberName("medium")] Medium,
    [JsonStringEnumMemberName("high")] High,
}

[JsonConverter(typeof(JsonStringEnumConverter<Experience>))]
public enum Experience
{
    [JsonStringEnumMemberName("beginner")] Beginner,
    [JsonStringEnumMemberName("intermediate")] Intermediate,
    [JsonStringEnumMemberName("advanced")] Advanced,
}

[JsonConverter(typeof(JsonStringEnumConverter<InjuryArea>))]
public enum InjuryArea
{
    [JsonStringEnumMemberName("shoulder")] Shoulder,
    [JsonStringEnumMemberName("knee")] Knee,
    [JsonStringEnumMemberName("lower-back")] LowerBack,
    [JsonStringEnumMemberName("hip")] Hip,
    [JsonStringEnumMemberName("ankle")] Ankle,
    [JsonStringEnumMemberName("elbow")] Elbow,
    [JsonStringEnumMemberName("wrist")] Wrist,
}

[JsonConverter(typeof(JsonStringEnumConverter<Side>))]
public enum Side
{
    [JsonStringEnumMemberName("left")] Left,
    [JsonStringEnumMemberName("right")] Right,
    [JsonStringEnumMemberName("both")] Both,
}

[JsonConverter(typeof(JsonStringEnumConverter<Severity>))]
public enum Severity
{
    [JsonStringEnumMemberName("mild")] Mild,
    [JsonStringEnumMemberName("moderate")] Moderate,
}

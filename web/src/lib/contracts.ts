// Shared contracts for the web app. Mirrors CONTRACTS.md, shared/program.schema.json
// and agent/Models/*.cs. Do not change a name here without changing all of them.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const GOALS = ["strength", "hypertrophy", "general", "endurance-support"] as const;
export const MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
] as const;
export const PATTERNS = [
  "squat",
  "hinge",
  "lunge",
  "horizontal-push",
  "vertical-push",
  "horizontal-pull",
  "vertical-pull",
  "carry",
  "core",
  "isolation",
] as const;
export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "bodyweight",
  "band",
  "trap-bar",
] as const;
export const SHOULDER_STRESS = ["low", "medium", "high"] as const;
export const EXPERIENCE = ["beginner", "intermediate", "advanced"] as const;

export const WeekDaySchema = z.enum(WEEK_DAYS);
export const GoalSchema = z.enum(GOALS);
export const MuscleSchema = z.enum(MUSCLES);
export const PatternSchema = z.enum(PATTERNS);
export const EquipmentSchema = z.enum(EQUIPMENT);
export const ShoulderStressSchema = z.enum(SHOULDER_STRESS);
export const ExperienceSchema = z.enum(EXPERIENCE);

export const IdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case id");

// ---------------------------------------------------------------------------
// Program state (the shared state). Matches shared/program.schema.json.
// ---------------------------------------------------------------------------

export const ExerciseEntrySchema = z
  .object({
    exerciseId: IdSchema,
    sets: z.number().int().min(1).max(10),
    /** "5", "8-10" or "30s". */
    reps: z.string().regex(/^[0-9]{1,2}(-[0-9]{1,2}|s)?$/),
    rpe: z.number().min(5).max(10).multipleOf(0.5),
    note: z.string().max(140),
  })
  .strict();

export const DaySchema = z
  .object({
    day: WeekDaySchema,
    focus: z.string().max(40),
    exercises: z.array(ExerciseEntrySchema).max(10),
  })
  .strict();

export const WeekSchema = z
  .object({
    week: z.number().int().min(1).max(12),
    days: z.array(DaySchema).max(7),
  })
  .strict();

export const FlagSchema = z
  .object({
    exerciseId: IdSchema,
    reason: z.string().max(140),
  })
  .strict();

export const ProgramStateSchema = z
  .object({
    clientId: IdSchema,
    goal: GoalSchema,
    daysPerWeek: z.number().int().min(1).max(6),
    weeks: z.array(WeekSchema).max(12),
    flags: z.array(FlagSchema),
  })
  .strict();

export type WeekDay = z.infer<typeof WeekDaySchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type Muscle = z.infer<typeof MuscleSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
export type ShoulderStress = z.infer<typeof ShoulderStressSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type ExerciseEntry = z.infer<typeof ExerciseEntrySchema>;
export type Day = z.infer<typeof DaySchema>;
export type Week = z.infer<typeof WeekSchema>;
export type Flag = z.infer<typeof FlagSchema>;
export type ProgramState = z.infer<typeof ProgramStateSchema>;

/** The state before the agent has written anything. */
export function emptyProgram(clientId: string, goal: Goal = "general", daysPerWeek = 3): ProgramState {
  return { clientId, goal, daysPerWeek, weeks: [], flags: [] };
}

// ---------------------------------------------------------------------------
// Seed data shapes (shared/seed/*.json)
// ---------------------------------------------------------------------------

export const ExerciseSchema = z
  .object({
    id: IdSchema,
    name: z.string().max(60),
    pattern: PatternSchema,
    /** First entry is the primary muscle. */
    muscles: z.array(MuscleSchema).min(1).max(4),
    equipment: z.array(EquipmentSchema).min(1),
    shoulderStress: ShoulderStressSchema,
    cues: z.array(z.string().max(80)).min(2).max(3),
  })
  .strict();

export const InjurySchema = z
  .object({
    area: z.enum(["shoulder", "knee", "lower-back", "hip", "ankle", "elbow", "wrist"]),
    side: z.enum(["left", "right", "both"]).optional(),
    severity: z.enum(["mild", "moderate"]),
    note: z.string().max(140),
  })
  .strict();

export const ClientSchema = z
  .object({
    id: IdSchema,
    name: z.string().max(40),
    age: z.number().int().min(16).max(90),
    goal: GoalSchema,
    experience: ExperienceSchema,
    daysPerWeek: z.number().int().min(1).max(6),
    equipment: z.array(EquipmentSchema).min(1),
    injuries: z.array(InjurySchema),
    notes: z.string().max(280),
  })
  .strict();

export type Exercise = z.infer<typeof ExerciseSchema>;
export type Injury = z.infer<typeof InjurySchema>;
export type Client = z.infer<typeof ClientSchema>;

// ---------------------------------------------------------------------------
// Models (GET /api/models, proxied to the agent's GET /models)
// ---------------------------------------------------------------------------

export const ModelOptionSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]*$/),
    label: z.string(),
    modelId: z.string(),
  })
  .strict();
export type ModelOption = z.infer<typeof ModelOptionSchema>;

/** Reserved model key backed by a recorded run (added in Phase 3). */
export const REPLAY_MODEL_KEY = "replay";

/** Dropdown and chat header text, e.g. "Quick (provider/model-name)". */
export function modelDisplayName(m: ModelOption): string {
  return `${m.label} (${m.modelId})`;
}

// ---------------------------------------------------------------------------
// Endpoints (browser side). The browser only ever talks to the Vite origin.
// ---------------------------------------------------------------------------

export const API = {
  copilotkit: "/api/copilotkit",
  models: "/api/models",
} as const;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const TOOLS = {
  getClient: "getClient",
  searchExercises: "searchExercises",
  updateProgram: "updateProgram",
  showExerciseCard: "showExerciseCard",
  showWeekSummary: "showWeekSummary",
  showProgressCard: "showProgressCard",
  proposeSwap: "proposeSwap",
  proposeChanges: "proposeChanges",
  /** Declarative how-to. Args schema lives in components/declarative/schema.ts (the security boundary). */
  showHowTo: "showHowTo",
  /** Parallel sub-agents (CONTRACTS section 11). The coach's backend tool, only on runs with the toggle on. */
  runSubagents: "runSubagents",
  /** The sub-agents' own scoped write tools. They only ever appear in subagent-attributed events. */
  writeDay: "writeDay",
  writeWeek: "writeWeek",
} as const;
export type ToolName = (typeof TOOLS)[keyof typeof TOOLS];

/** getClient (backend). Returns a Client. */
export const GetClientArgsSchema = z.object({ clientId: IdSchema }).strict();

/** searchExercises (backend). Returns Exercise[] (at most 10). All filters optional, combined with AND. */
export const SearchExercisesArgsSchema = z
  .object({
    query: z.string().max(60).optional(),
    pattern: PatternSchema.optional(),
    muscle: MuscleSchema.optional(),
    equipment: EquipmentSchema.optional(),
    maxShoulderStress: ShoulderStressSchema.optional(),
  })
  .strict();

/**
 * updateProgram (shared state; fallback: frontend tool). Returns the full ProgramState.
 * - clientId / goal / daysPerWeek: set when present.
 * - days: upsert, matched on (week, day). A new week is created if needed.
 * - removeDays: delete days matched on (week, day).
 * - flags: replaces the whole flags list when present.
 */
export const UpdateProgramArgsSchema = z
  .object({
    clientId: IdSchema.optional(),
    goal: GoalSchema.optional(),
    daysPerWeek: z.number().int().min(1).max(6).optional(),
    days: z
      .array(DaySchema.extend({ week: z.number().int().min(1).max(12) }).strict())
      .max(28)
      .optional(),
    removeDays: z
      .array(z.object({ week: z.number().int().min(1).max(12), day: WeekDaySchema }).strict())
      .optional(),
    flags: z.array(FlagSchema).optional(),
  })
  .strict();

/** showExerciseCard (frontend render). Name, cues and shoulder stress come from the seed library. */
export const ShowExerciseCardArgsSchema = z
  .object({
    exerciseId: IdSchema,
    sets: z.number().int().min(1).max(10),
    reps: ExerciseEntrySchema.shape.reps,
    rpe: ExerciseEntrySchema.shape.rpe,
    week: z.number().int().min(1).max(12).optional(),
    day: WeekDaySchema.optional(),
    note: z.string().max(140).optional(),
  })
  .strict();

/** showWeekSummary (frontend render). Sets per muscle are computed in the browser from program state. */
export const ShowWeekSummaryArgsSchema = z
  .object({
    week: z.number().int().min(1).max(12),
    note: z.string().max(200).optional(),
  })
  .strict();

/** showProgressCard (frontend render). One lift's recent weekly top-set trend. */
export const ShowProgressCardArgsSchema = z
  .object({
    lift: z.string().max(60),
    points: z
      .array(
        z
          .object({
            week: z.number().int().min(1).max(52),
            kg: z.number().min(0).max(1000),
          })
          .strict(),
      )
      .min(2)
      .max(26),
    topSet: z.string().max(40),
    est1rm: z.number().min(0).max(1000),
    goal: z.number().min(0).max(1000).optional(),
    trend: z
      .object({
        tone: z.enum(["ok", "flag"]),
        label: z.string().max(40),
      })
      .strict(),
  })
  .strict();

/**
 * proposeSwap (frontend human in the loop).
 * When week and day are both omitted the swap applies to every occurrence.
 */
export const ProposeSwapArgsSchema = z
  .object({
    fromExerciseId: IdSchema,
    toExerciseId: IdSchema,
    reason: z.string().max(200),
    week: z.number().int().min(1).max(12).optional(),
    day: WeekDaySchema.optional(),
  })
  .strict();

/** What SwapApproval passes to respond(). */
export const ProposeSwapResultSchema = z
  .object({
    approved: z.boolean(),
    fromExerciseId: IdSchema,
    toExerciseId: IdSchema,
  })
  .strict();

/** proposeChanges (frontend human in the loop). Batch program changes for the trainer to approve or reject. */
export const ProposeChangesArgsSchema = z
  .object({
    week: z.number().int().min(1).max(12),
    rows: z
      .array(
        z
          .object({
            cell: z.string().max(40),
            before: z.string().max(80),
            after: z.string().max(80),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    reason: z.string().max(200).optional(),
  })
  .strict();

export const ProposeChangesResultSchema = z
  .object({
    approved: z.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Parallel sub-agents (CONTRACTS section 11)
// ---------------------------------------------------------------------------

export const SUBAGENT_KINDS = ["build-day", "build-week", "injury-screen"] as const;
export const SubagentKindSchema = z.enum(SUBAGENT_KINDS);

export const SUBAGENTS = {
  /** Description of the AG-UI context entry the header toggle sends (useAgentContext). Value: `{ enabled: boolean }`. */
  contextDescription: "Parallel sub-agents",
  maxTasks: 7,
  maxBriefLength: 400,
  /** SUBAGENT_STARTED.name for each kind. */
  names: { "build-day": "day-builder", "build-week": "week-builder", "injury-screen": "injury-screen" },
} as const;

export const SubagentTaskSchema = z
  .object({
    kind: SubagentKindSchema,
    brief: z.string().max(SUBAGENTS.maxBriefLength),
    week: z.number().int().min(1).max(12).optional(),
    day: WeekDaySchema.optional(),
    focus: z.string().max(40).optional(),
  })
  .strict();

/** runSubagents (.NET backend, rendered by the web app as SubagentBoard). */
export const RunSubagentsArgsSchema = z
  .object({
    clientId: IdSchema.optional(),
    goal: GoalSchema.optional(),
    daysPerWeek: z.number().int().min(1).max(6).optional(),
    tasks: z.array(SubagentTaskSchema).min(1).max(SUBAGENTS.maxTasks),
  })
  .strict();

/** One sub-agent's report: SUBAGENT_FINISHED.result, and an entry of the runSubagents result's `reports`. */
export const SubagentReportSchema = z.object({
  subagentRunId: z.string(),
  kind: SubagentKindSchema,
  title: z.string(),
  status: z.enum(["done", "error"]),
  summary: z.string(),
  week: z.number().int().optional(),
  day: WeekDaySchema.optional(),
  wrote: z.array(z.string()).optional(),
  riskyLifts: z.array(z.string()).optional(),
  durationMs: z.number(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
});

export type SubagentKind = z.infer<typeof SubagentKindSchema>;
export type SubagentTask = z.infer<typeof SubagentTaskSchema>;
export type RunSubagentsArgs = z.infer<typeof RunSubagentsArgsSchema>;
export type SubagentReport = z.infer<typeof SubagentReportSchema>;

export type GetClientArgs = z.infer<typeof GetClientArgsSchema>;
export type SearchExercisesArgs = z.infer<typeof SearchExercisesArgsSchema>;
export type UpdateProgramArgs = z.infer<typeof UpdateProgramArgsSchema>;
export type ShowExerciseCardArgs = z.infer<typeof ShowExerciseCardArgsSchema>;
export type ShowWeekSummaryArgs = z.infer<typeof ShowWeekSummaryArgsSchema>;
export type ShowProgressCardArgs = z.infer<typeof ShowProgressCardArgsSchema>;
export type ProposeSwapArgs = z.infer<typeof ProposeSwapArgsSchema>;
export type ProposeSwapResult = z.infer<typeof ProposeSwapResultSchema>;
export type ProposeChangesArgs = z.infer<typeof ProposeChangesArgsSchema>;
export type ProposeChangesResult = z.infer<typeof ProposeChangesResultSchema>;

// ---------------------------------------------------------------------------
// Weekly volume (WeekSummary)
// ---------------------------------------------------------------------------

/** A set counts 1.0 for an exercise's primary muscle and 0.5 for each other muscle. */
export const VOLUME_WEIGHTS = { primary: 1, secondary: 0.5 } as const;

/** Weekly sets per muscle. Below min is "too little", above max is "too much". Only muscles with sets > 0 are judged. */
export const VOLUME_RANGE = { min: 4, max: 16 } as const;

// ---------------------------------------------------------------------------
// Test ids (Playwright relies on these; see CONTRACTS.md section 7)
// ---------------------------------------------------------------------------

export const TEST_IDS = {
  modelSelect: "model-select",
  activeModel: "active-model",
  clientSelect: "client-select",
  chat: "chat",
  disclaimer: "disclaimer",
  programGrid: "program-grid",
  weekTab: "grid-week-tab",
  gridDay: "grid-day",
  gridCell: "grid-cell",
  exerciseCard: "exercise-card",
  weekSummary: "week-summary",
  swapApproval: "swap-approval",
  swapApprove: "swap-approve",
  swapReject: "swap-reject",
  programDiffCard: "program-diff-card",
  voiceInput: "voice-input",
  /** Parallel sub-agents switch (role="switch", aria-checked). */
  subagentsToggle: "subagents-toggle",
  /** SubagentBoard root: data-state = running/done, data-count = number of sub-agents. */
  subagentBoard: "subagent-board",
  /** One lane: data-subagent-run-id, data-kind, data-status = running/done/error. */
  subagentLane: "subagent-lane",
} as const;

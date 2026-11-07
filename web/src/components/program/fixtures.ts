import type { Day, Flag } from "../../lib/contracts";

export interface FixtureExercise {
  slot: string;
  exerciseId: string;
  displayName: string;
  sets: number;
  reps: string;
  rpe: number;
  /** True if the agent just edited this entry. */
  agentEdited?: boolean;
  /** Flag reason, e.g. "Shoulder history". */
  flagReason?: string;
}

export interface FixtureDay {
  label: string;
  week: number;
  totalWeeks: number;
  blockName: string;
  clientName: string;
  exercises: FixtureExercise[];
}

export interface FixtureWeekOption {
  value: number;
  label: string;
}

/** Aroha Tane – Day 3 (Full body) fixture with agent edits and flags. */
export const day3Fixture: FixtureDay = {
  label: "Wed",
  week: 3,
  totalWeeks: 6,
  blockName: "Strength block",
  clientName: "Aroha Tane",
  exercises: [
    {
      slot: "A1",
      exerciseId: "back-squat",
      displayName: "Pause Squat",
      sets: 3,
      reps: "4",
      rpe: 6,
      agentEdited: true,
    },
    {
      slot: "A2",
      exerciseId: "pull-up",
      displayName: "Pull-up",
      sets: 4,
      reps: "6",
      rpe: 8,
    },
    {
      slot: "B1",
      exerciseId: "overhead-press",
      displayName: "Overhead Press",
      sets: 3,
      reps: "8",
      rpe: 7,
      flagReason: "Shoulder history",
    },
    {
      slot: "B2",
      exerciseId: "hip-thrust",
      displayName: "Hip Thrust",
      sets: 3,
      reps: "10",
      rpe: 7,
    },
    {
      slot: "C1",
      exerciseId: "farmer-carry",
      displayName: "Farmer Carry",
      sets: 3,
      reps: "30 m",
      rpe: 7,
    },
  ],
};

export const weekOptions: FixtureWeekOption[] = [
  { value: 1, label: "Wk 1 of 6" },
  { value: 2, label: "Wk 2 of 6" },
  { value: 3, label: "Wk 3 of 6" },
  { value: 4, label: "Wk 4 of 6" },
  { value: 5, label: "Wk 5 of 6" },
  { value: 6, label: "Wk 6 of 6" },
];

export function dayToContractDay(fixture: FixtureDay): Day {
  return {
    day: fixture.label as Day["day"],
    focus: fixture.blockName,
    exercises: fixture.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets,
      reps: e.reps,
      rpe: e.rpe,
      note: e.flagReason ?? "",
    })),
  };
}

export function fixtureFlags(fixture: FixtureDay): Flag[] {
  return fixture.exercises
    .filter((e) => e.flagReason)
    .map((e) => ({ exerciseId: e.exerciseId, reason: e.flagReason! }));
}

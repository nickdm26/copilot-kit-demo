import type { Day, Flag } from "../../lib/contracts";
import type { DayViewDay, DayViewExercise } from "./MobileDayView";

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
  { value: 1, label: "Wk 1" },
  { value: 2, label: "Wk 2" },
  { value: 3, label: "Wk 3" },
  { value: 4, label: "Wk 4" },
  { value: 5, label: "Wk 5" },
  { value: 6, label: "Wk 6" },
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

/** The fixture as MobileDayView data: three days, the Wed one filled in. */
export function fixtureDayViewDays(fixture: FixtureDay): DayViewDay[] {
  const exercises: DayViewExercise[] = fixture.exercises.map((e) => ({
    key: e.slot,
    slot: e.slot,
    name: e.displayName,
    prescription: `${e.sets} x ${e.reps}${e.reps.endsWith(" m") ? "" : ` @ RPE ${e.rpe}`}`,
    flagReason: e.flagReason,
    agentEdited: e.agentEdited,
  }));
  return [
    { value: "Mon", label: "Day 1 · Lower", exercises: exercises.slice(0, 3) },
    { value: "Wed", label: "Day 2 · Upper", exercises: exercises.slice(1, 4) },
    { value: fixture.label === "Wed" ? "Fri" : fixture.label, label: "Day 3 · Full", exercises },
  ];
}

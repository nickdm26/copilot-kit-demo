import { MUSCLES, VOLUME_RANGE, VOLUME_WEIGHTS, type Muscle, type ProgramState } from "../../lib/contracts";
import { findExercise } from "./exercises";

export type VolumeVerdict = "low" | "ok" | "high";

export interface MuscleVolume {
  muscle: Muscle;
  sets: number;
  verdict: VolumeVerdict;
}

/** Sets per muscle for one week: 1.0 per set for the primary muscle, 0.5 for each other muscle. */
export function computeWeekVolume(program: ProgramState, week: number): MuscleVolume[] {
  const totals = new Map<Muscle, number>();
  const w = program.weeks.find((x) => x.week === week);
  for (const day of w?.days ?? []) {
    for (const entry of day.exercises) {
      const ex = findExercise(entry.exerciseId);
      if (!ex) continue;
      ex.muscles.forEach((m, i) => {
        const weight = i === 0 ? VOLUME_WEIGHTS.primary : VOLUME_WEIGHTS.secondary;
        totals.set(m, (totals.get(m) ?? 0) + entry.sets * weight);
      });
    }
  }
  return MUSCLES.map((muscle) => {
    const sets = totals.get(muscle) ?? 0;
    const verdict: VolumeVerdict =
      sets > 0 && sets < VOLUME_RANGE.min ? "low" : sets > VOLUME_RANGE.max ? "high" : "ok";
    return { muscle, sets, verdict };
  }).filter((r) => r.sets > 0);
}

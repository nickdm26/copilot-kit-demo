import { z } from "zod";
import exercisesJson from "@seed/exercises.json";
import { ExerciseSchema, type Exercise } from "../../lib/contracts";

const library: Exercise[] = z.array(ExerciseSchema).parse(exercisesJson);
const byId = new Map(library.map((e) => [e.id, e]));

/** Seed library lookup. Undefined for an unknown id. */
export function findExercise(id: string | undefined): Exercise | undefined {
  return id ? byId.get(id) : undefined;
}

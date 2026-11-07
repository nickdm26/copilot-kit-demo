import { TEST_IDS, type ShowExerciseCardArgs } from "../../lib/contracts";
import { Badge, Card, cx, type BadgeTone } from "../ui";
import { findExercise } from "./exercises";

export interface ExerciseCardProps {
  args: Partial<ShowExerciseCardArgs>;
  state: "streaming" | "done";
}

const stressTone: Record<string, BadgeTone> = { low: "ok", medium: "accent", high: "flag" };

function Bar({ w }: { w: string }) {
  return <div className={cx("h-3 rounded-sm bg-border animate-pulse", w)} />;
}

export function ExerciseCard({ args, state }: ExerciseCardProps) {
  const ex = findExercise(args.exerciseId);
  const hasPrescription = args.sets !== undefined && args.reps !== undefined && args.rpe !== undefined;
  const where = [args.week !== undefined ? `Week ${args.week}` : null, args.day ?? null].filter(Boolean).join(" ");

  return (
    <Card
      data-testid={TEST_IDS.exerciseCard}
      data-exercise-id={args.exerciseId ?? ""}
      data-state={state}
      className="my-2 flex flex-col gap-2"
    >
      {!args.exerciseId ? (
        <>
          <Bar w="w-2/3" />
          <Bar w="w-1/3" />
        </>
      ) : !ex ? (
        <p className="text-sm text-ink-muted">Unknown exercise: {args.exerciseId}</p>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <h3 className="font-heading text-xl uppercase tracking-wide mr-auto">{ex.name}</h3>
            <Badge tone={stressTone[ex.shoulderStress]}>Shoulder stress: {ex.shoulderStress}</Badge>
          </div>
          {hasPrescription ? (
            <p className="tabular text-sm font-medium">
              {args.sets} x {args.reps} @ RPE {args.rpe}
              {where ? <span className="text-ink-muted font-normal"> · {where}</span> : null}
            </p>
          ) : (
            <Bar w="w-1/2" />
          )}
          <ul className="list-disc pl-5 text-sm text-ink-muted">
            {ex.cues.slice(0, 3).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {args.note ? <p className="text-sm">{args.note}</p> : null}
        </>
      )}
    </Card>
  );
}

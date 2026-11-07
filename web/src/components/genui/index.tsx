import { useState } from "react";
import { useFrontendTool, useHumanInTheLoop } from "@copilotkit/react-core/v2";
import {
  ProposeSwapArgsSchema,
  ShowExerciseCardArgsSchema,
  ShowWeekSummaryArgsSchema,
  TOOLS,
  type ProposeSwapArgs,
  type ProposeSwapResult,
} from "../../lib/contracts";
import { ExerciseCard } from "./ExerciseCard";
import { SwapApproval, type SwapState } from "./SwapApproval";
import { WeekSummary } from "./WeekSummary";
import { useProgramState } from "./useProgramState";
import { computeWeekVolume } from "./weekVolume";

function WeekSummaryTool({ args, streaming }: { args: { week?: number | string; note?: string }; streaming: boolean }) {
  const program = useProgramState();
  // Some models send the week as a string ("2"); a few send no args at all.
  const parsed = Number(args.week);
  const week = args.week === undefined || !Number.isInteger(parsed) ? undefined : parsed;
  if (!streaming && week === undefined) return null;
  const rows = week === undefined ? [] : computeWeekVolume(program, week);
  return <WeekSummary week={week} note={args.note} rows={rows} state={streaming ? "streaming" : "done"} />;
}

function SwapTool(props: {
  args: Partial<ProposeSwapArgs>;
  status: string;
  result?: string;
  respond?: (r: unknown) => Promise<void>;
}) {
  const { args, status, result, respond } = props;
  const [answer, setAnswer] = useState<boolean | null>(null);
  let state: SwapState;
  if (answer !== null) state = answer ? "approved" : "rejected";
  else if (status === "complete") {
    let approved = false;
    try {
      approved = JSON.parse(result ?? "{}").approved === true;
    } catch {
      /* keep false */
    }
    state = approved ? "approved" : "rejected";
  } else state = status === "executing" ? "pending" : "streaming";

  const onAnswer = (approved: boolean) => {
    if (!respond || !args.fromExerciseId || !args.toExerciseId) return;
    setAnswer(approved);
    const out: ProposeSwapResult = { approved, fromExerciseId: args.fromExerciseId, toExerciseId: args.toExerciseId };
    void respond(out);
  };
  return <SwapApproval args={args} state={state} onAnswer={onAnswer} />;
}

/** Registers the three generative UI tools. Mount once inside the providers. Renders nothing. */
export function GenUi(): null {
  // useFrontendTool (not useRenderTool): useRenderTool only renders, it never sends the tool definition to the model.
  useFrontendTool({
    name: TOOLS.showExerciseCard,
    description: "Show an exercise card (name, prescription, cues, shoulder stress) for a lift in the chat.",
    parameters: ShowExerciseCardArgsSchema,
    followUp: false,
    handler: async () => "shown",
    // A finished call with no exercise id (some models send empty args) has nothing to show.
    render: ({ args, status }) =>
      status !== "inProgress" && !args.exerciseId ? null : (
        <ExerciseCard args={args} state={status === "inProgress" ? "streaming" : "done"} />
      ),
  });

  useFrontendTool({
    name: TOOLS.showWeekSummary,
    description: "Show the weekly training volume (sets per muscle) for a week of the current program.",
    parameters: ShowWeekSummaryArgsSchema,
    // The agent shows a summary after each week mid-build, so it must get a turn back to write the next week.
    followUp: true,
    handler: async () => "shown",
    render: ({ args, status }) => <WeekSummaryTool args={args} streaming={status === "inProgress"} />,
  });

  useHumanInTheLoop({
    name: TOOLS.proposeSwap,
    description:
      "Ask the trainer to approve swapping one exercise for another. Returns { approved, fromExerciseId, toExerciseId }.",
    parameters: ProposeSwapArgsSchema,
    render: ({ args, status, result, respond }) => (
      <SwapTool args={args} status={status} result={result} respond={respond} />
    ),
  });

  return null;
}

export { ExerciseCard, SwapApproval, WeekSummary, computeWeekVolume };

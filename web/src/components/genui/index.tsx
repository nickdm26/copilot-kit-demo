import { useEffect, useId, useRef, useState } from "react";
import { useFrontendTool, useHumanInTheLoop } from "@copilotkit/react-core/v2";
import {
  ProposeSwapArgsSchema,
  ProposeChangesArgsSchema,
  ShowExerciseCardArgsSchema,
  ShowProgressCardArgsSchema,
  ShowWeekSummaryArgsSchema,
  TOOLS,
  type ProposeSwapArgs,
  type ProposeSwapResult,
  type ProposeChangesArgs,
  type ProposeChangesResult,
  type ShowProgressCardArgs,
} from "../../lib/contracts";
import { ExerciseCard } from "./ExerciseCard";
import { ProgressCard } from "../agent/ProgressCard";
import { ProgramDiffCard } from "../agent/ProgramDiffCard";
import { SwapApproval, type SwapState } from "./SwapApproval";
import { WeekSummary } from "./WeekSummary";
import { useProgramState } from "./useProgramState";
import { computeWeekVolume } from "./weekVolume";
import { Card } from "../ui";
import { useHowToTool } from "../declarative";
import { useSubagentsTool } from "../subagents";
import { useSendUserMessage } from "../agent/useSendUserMessage";
import { usePendingApproval } from "../agent/pendingApprovals";
import { useSession } from "../../lib/session";

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

  // Some models occasionally send a proposeSwap with empty args. There is nothing to approve, but the run waits
  // for an answer, so decline it once and show nothing.
  const empty = status === "executing" && (!args.fromExerciseId || !args.toExerciseId);
  const declined = useRef(false);
  useEffect(() => {
    if (!empty || !respond || declined.current) return;
    declined.current = true;
    void respond({ approved: false, fromExerciseId: "", toExerciseId: "" });
  }, [empty, respond]);

  usePendingApproval(useId(), state === "pending" && !empty, 1);

  const onAnswer = (approved: boolean) => {
    if (!respond || !args.fromExerciseId || !args.toExerciseId) return;
    setAnswer(approved);
    const out: ProposeSwapResult = { approved, fromExerciseId: args.fromExerciseId, toExerciseId: args.toExerciseId };
    void respond(out);
  };
  if (empty || (status === "complete" && !args.fromExerciseId)) return null;
  return <SwapApproval args={args} state={state} onAnswer={onAnswer} />;
}

function ProgressCardTool({ args, streaming }: { args: Partial<ShowProgressCardArgs>; streaming: boolean }) {
  // A finished call without points has nothing to chart; some models send empty args.
  if (!streaming && !args.points) return null;
  if (!args.points || args.points.length < 2) {
    return streaming ? (
      <Card className="my-2 h-24 animate-pulse bg-surface" />
    ) : null;
  }
  return (
    <ProgressCard
      lift={args.lift ?? "Lift"}
      points={args.points}
      topSet={args.topSet ?? ""}
      est1rm={args.est1rm ?? 0}
      goal={args.goal}
      trend={args.trend ?? { tone: "ok", label: "Progressing" }}
      className="my-2"
    />
  );
}

function ProposeChangesTool(props: {
  args: Partial<ProposeChangesArgs>;
  status: string;
  result?: string;
  respond?: (r: unknown) => Promise<void>;
}) {
  const { args, status, result, respond } = props;
  const parsed = ProposeChangesArgsSchema.safeParse(args);
  const valid = parsed.success ? parsed.data : null;
  // The trainer's answer shows at once; the tool status catches up when the agent's next run starts.
  const [answer, setAnswer] = useState<{ approved: boolean; at: string } | null>(null);
  let cardStatus: "pending" | "approved" | "rejected" = "pending";
  if (answer) cardStatus = answer.approved ? "approved" : "rejected";
  else if (status === "complete") {
    try {
      const r = JSON.parse(result ?? "{}");
      cardStatus = r.approved === true ? "approved" : "rejected";
    } catch {
      cardStatus = "rejected";
    }
  }

  usePendingApproval(useId(), status === "executing" && !answer && valid !== null, valid?.rows.length ?? 0);

  const answerWith = (approved: boolean) => {
    if (!respond || answer) return;
    setAnswer({ approved, at: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) });
    const out: ProposeChangesResult = { approved };
    void respond(out);
  };

  // After the answer, respond() is used up, so follow-ups (the rejected-state chips, Undo) go to the agent as a new
  // trainer message (sent after any run in progress).
  const { modelKey } = useSession();
  const send = useSendUserMessage(modelKey);
  const handleSuggest = (text: string) => send(valid ? `${text} for week ${valid.week}` : text);
  const handleUndo = valid
    ? () => send(`Undo the week ${valid.week} changes you just applied and put those cells back as they were`)
    : undefined;

  return (
    <ProgramDiffCard
      week={valid?.week ?? 0}
      rows={valid?.rows ?? [{ cell: "…", before: "…", after: "…" }]}
      reason={valid?.reason}
      status={cardStatus}
      appliedAt={answer?.approved ? answer.at : undefined}
      onApproveAll={() => answerWith(true)}
      onReject={() => answerWith(false)}
      onUndo={handleUndo}
      onSuggest={handleSuggest}
    />
  );
}

/** Registers the generative UI tools. Mount once inside the providers. Renders nothing. */
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

  useFrontendTool({
    name: TOOLS.showProgressCard,
    description:
      "Show a progress card (chart of a lift's weekly top-set trend) in the chat when the trainer asks how a lift is going.",
    parameters: ShowProgressCardArgsSchema,
    followUp: false,
    handler: async () => "shown",
    render: ({ args, status }) => (
      <ProgressCardTool args={args} streaming={status === "inProgress"} />
    ),
  });

  useHumanInTheLoop({
    name: TOOLS.proposeSwap,
    description:
      "Ask the trainer to approve swapping one exercise for another. Call it before any swap, and for each shoulder-risky lift. Returns { approved, fromExerciseId, toExerciseId }.",
    parameters: ProposeSwapArgsSchema,
    render: ({ args, status, result, respond }) => (
      <SwapTool args={args} status={status} result={result} respond={respond} />
    ),
  });

    useHumanInTheLoop({
      name: TOOLS.proposeChanges,
      description:
        "Ask the trainer to approve or reject a batch of program changes. Call it before changing any day already in the program (deloads, equipment swaps, rebalancing). Returns { approved }.",
      parameters: ProposeChangesArgsSchema,
      render: ({ args, status, result, respond }) => (
        <ProposeChangesTool args={args} status={status} result={result} respond={respond} />
      ),
    });

  // showHowTo is a backend tool; this only renders its calls (declarative how-to, Task 9).
  useHowToTool();

  // runSubagents is a backend tool too; this draws the live sub-agent board for each call (CONTRACTS section 11).
  useSubagentsTool();

  return null;
}

export { ExerciseCard, SwapApproval, WeekSummary, computeWeekVolume };

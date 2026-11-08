import { useEffect, useState } from "react";
import { UseAgentUpdate, useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { ProgramStateSchema, TEST_IDS, TOOLS } from "../../lib/contracts";
import { useSession } from "../../lib/session";
import { changedCells } from "../program-grid/applyUpdate";
import { AgentStatusStrip, type AgentStatusStripProps, type StepState } from "./AgentStatusStrip";
import { usePendingApprovals } from "./pendingApprovals";

/**
 * Binds AgentStatusStrip to the running agent.
 *
 * - Each AG-UI run is followed through `agent.subscribe`: every tool call becomes a step ("Read client profile",
 *   "Wrote week 2 · Mon"), a run error shows the error state, and the end of a run shows "Done" with the step count
 *   and how many grid cells the run changed.
 * - While an approval card waits for the trainer (see pendingApprovals.ts) the strip says so.
 */
export function ConnectedAgentStatusStrip() {
  const { modelKey } = useSession();
  // The provider only mounts agents once a model is chosen; render nothing until then.
  if (!modelKey) return null;
  return <BoundStatusStrip agentId={modelKey} />;
}

interface Step {
  id: string;
  label: string;
}

interface RunView {
  phase: "idle" | "working" | "done" | "error";
  steps: Step[];
  cells: number;
  error?: string;
}

const IDLE: RunView = { phase: "idle", steps: [], cells: 0 };

function BoundStatusStrip({ agentId }: { agentId: string }) {
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnRunStatusChanged] });
  const { copilotkit } = useCopilotKit();
  const { threadId, clients, clientId } = useSession();
  const pending = usePendingApprovals();
  const [run, setRun] = useState<RunView>(IDLE);
  const [stepsOpen, setStepsOpen] = useState(false);

  useEffect(() => {
    setRun(IDLE);
    setStepsOpen(false);
    // One turn = a trainer message plus the follow-up runs it sets off (after a frontend tool or an approval).
    // Steps and changed cells add up over the whole turn.
    let turnStartState: unknown = null;
    let runState: unknown = null;
    let newTurn = true;
    // CopilotKit's thread connect also goes through onRunInitialized / onRunFinalized, but it never sends
    // RUN_STARTED. Only a real run (one that started) changes the strip.
    let started = false;
    const args = new Map<string, { name: string; json: string }>();
    const setStep = (id: string, label: string) =>
      setRun((r) => ({ ...r, steps: r.steps.map((s) => (s.id === id ? { ...s, label } : s)) }));

    const sub = agent.subscribe({
      onRunInitialized: ({ state, messages }) => {
        runState = state;
        newTurn = messages[messages.length - 1]?.role === "user";
        started = false;
      },
      onRunStartedEvent: () => {
        started = true;
        if (newTurn) {
          turnStartState = runState;
          args.clear();
          setStepsOpen(false);
          setRun({ phase: "working", steps: [], cells: 0 });
        } else {
          setRun((r) => ({ ...r, phase: "working", error: undefined }));
        }
      },
      onToolCallStartEvent: ({ event }) => {
        // A sub-agent's own calls belong to its lane in the SubagentBoard, not to the coach's steps.
        if (event.subagentRunId) return;
        args.set(event.toolCallId, { name: event.toolCallName, json: "" });
        const step = { id: event.toolCallId, label: stepLabel(event.toolCallName, null) };
        setRun((r) => ({ ...r, steps: [...r.steps, step] }));
      },
      onToolCallArgsEvent: ({ event }) => {
        const call = args.get(event.toolCallId);
        if (call) call.json += event.delta;
      },
      onToolCallEndEvent: ({ event }) => {
        const call = args.get(event.toolCallId);
        if (!call) return;
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(call.json);
        } catch {
          /* keep the generic label */
        }
        setStep(event.toolCallId, stepLabel(call.name, parsed));
      },
      onRunErrorEvent: ({ event }) => setRun((r) => ({ ...r, phase: "error", error: event.message })),
      onRunFailed: ({ error }) => setRun((r) => ({ ...r, phase: "error", error: error.message })),
      onRunFinalized: ({ state }) => {
        if (!started) return;
        started = false;
        setRun((r) => (r.phase === "error" ? r : { ...r, phase: "done", cells: countChanged(turnStartState, state) }));
      },
    });
    return () => sub.unsubscribe();
  }, [agent, threadId]);

  const steps = collapse(run.steps);
  const client = clients.find((c) => c.id === clientId);
  const firstName = client?.name.split(" ")[0];

  let status: AgentStatusStripProps["status"] = "idle";
  if (run.phase === "error") status = "error";
  else if (pending.length > 0) status = "awaiting-approval";
  else if (agent.isRunning) status = "working";
  else if (run.phase === "working" || run.phase === "done") status = "done";

  const stepStates = steps.map((label, i) => ({
    label,
    state: (status === "working" && i === steps.length - 1 ? "active" : "done") as StepState,
  }));

  const summary = [
    `${steps.length} ${steps.length === 1 ? "step" : "steps"}`,
    run.cells > 0 ? `${run.cells} ${run.cells === 1 ? "cell" : "cells"} changed` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AgentStatusStrip
      status={status}
      steps={stepStates}
      summary={summary}
      idleText={firstName ? `Ready. Reading ${firstName}'s profile.` : "Ready."}
      errorMessage={run.error}
      stepsOpen={stepsOpen}
      onShowSteps={steps.length > 0 ? () => setStepsOpen((o) => !o) : undefined}
      onRetry={() => void copilotkit.runAgent({ agent })}
      onSwitchModel={focusModelPicker}
    />
  );
}

/** A readable step for one tool call. `args` is the parsed arguments once the call has finished streaming. */
function stepLabel(tool: string, args: unknown): string {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  switch (tool) {
    case TOOLS.getClient:
      return "Read client profile";
    case TOOLS.searchExercises:
      return "Searched exercise library";
    case TOOLS.updateProgram: {
      const days = Array.isArray(a.days) ? (a.days as { week?: unknown; day?: unknown }[]) : [];
      const weeks = [...new Set(days.map((d) => Number(d.week)).filter(Number.isInteger))];
      if (weeks.length === 1 && days.length === 1 && typeof days[0].day === "string")
        return `Wrote week ${weeks[0]} · ${days[0].day}`;
      if (weeks.length === 1) return `Wrote week ${weeks[0]}`;
      if (weeks.length > 1) return `Wrote weeks ${Math.min(...weeks)} to ${Math.max(...weeks)}`;
      return "Updated the program";
    }
    case TOOLS.showWeekSummary:
      return Number.isInteger(Number(a.week)) ? `Checked week ${Number(a.week)} volume` : "Checked weekly volume";
    case TOOLS.showExerciseCard:
      return "Showed an exercise card";
    case TOOLS.showProgressCard:
      return typeof a.lift === "string" ? `Charted ${a.lift}` : "Charted progress";
    case TOOLS.proposeSwap:
      return "Proposed a swap";
    case TOOLS.proposeChanges:
      return Array.isArray(a.rows) ? `Proposed ${a.rows.length} changes` : "Proposed changes";
    case TOOLS.showHowTo:
      return "Built a how-to";
    case TOOLS.runSubagents:
      return Array.isArray(a.tasks) ? `Ran ${a.tasks.length} sub-agents in parallel` : "Ran sub-agents in parallel";
    default:
      return tool;
  }
}

/** Merge repeats in a row ("Searched exercise library ×3"). */
function collapse(steps: Step[]): string[] {
  const out: { label: string; n: number }[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last && last.label === s.label) last.n += 1;
    else out.push({ label: s.label, n: 1 });
  }
  return out.map((s) => (s.n > 1 ? `${s.label} ×${s.n}` : s.label));
}

function countChanged(before: unknown, after: unknown): number {
  const next = ProgramStateSchema.safeParse(after);
  if (!next.success) return 0;
  const prev = ProgramStateSchema.safeParse(before);
  return changedCells(prev.success ? prev.data : null, next.data).length;
}

function focusModelPicker() {
  const el = document.querySelector<HTMLSelectElement>(`[data-testid="${TEST_IDS.modelSelect}"]`);
  if (!el) return;
  el.focus();
  try {
    el.showPicker?.();
  } catch {
    /* showPicker needs a user gesture in some browsers; focus is enough */
  }
}

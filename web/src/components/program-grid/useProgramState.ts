// Binds the grid to the AG-UI agent state (CONTRACTS section 9, Plan A).
// The agent state IS a ProgramState. STATE_SNAPSHOT events from updateProgram replace it; trainer edits call
// agent.setState(next), so the next run sends the edited program to the agent.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { UseAgentUpdate, useAgent } from "@copilotkit/react-core/v2";
import { ProgramStateSchema, emptyProgram, type ProgramState } from "../../lib/contracts";
import { changedCells } from "./applyUpdate";

/** How long a cell the agent wrote stays highlighted (matches the agent-touched animation in theme.css). */
export const AGENT_TOUCH_MS = 2000;

const UPDATES = [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged];

export interface ProgramStateBinding {
  /** The validated program; the empty program when the agent state is not a valid ProgramState. */
  program: ProgramState;
  /** Write a trainer edit (full state). */
  setProgram: (next: ProgramState) => void;
  /** Cell key -> highlight generation, for cells the agent just wrote. */
  touched: ReadonlyMap<string, number>;
  isRunning: boolean;
}

export function useProgramState(agentId: string, threadId: string, clientId: string): ProgramStateBinding {
  const { agent } = useAgent({ agentId, updates: UPDATES });

  // A new thread (model or client change) starts from the empty program. Also covers the
  // provisional agent being swapped for the real one at startup.
  const resetFor = useRef<{ agent: unknown; threadId: string } | null>(null);
  const lastLocalWrite = useRef<string | null>(null);
  useEffect(() => {
    const prev = resetFor.current;
    if (prev && prev.agent === agent && prev.threadId === threadId) return;
    resetFor.current = { agent, threadId };
    const empty = emptyProgram(clientId);
    lastLocalWrite.current = JSON.stringify(empty);
    agent.setState(empty);
  }, [agent, threadId, clientId]);

  const raw = agent.state as unknown;
  const rawJson = useMemo(() => JSON.stringify(raw ?? null), [raw]);

  // CopilotKit's connect on a fresh thread clears the state to {} after the reset above has run. Whenever the agent
  // is idle and its state is not a ProgramState, write the empty program, so every run sends a valid ProgramState.
  const isRunning = agent.isRunning;
  useEffect(() => {
    if (isRunning || ProgramStateSchema.safeParse(agent.state).success) return;
    const empty = emptyProgram(clientId);
    lastLocalWrite.current = JSON.stringify(empty);
    agent.setState(empty);
  }, [agent, rawJson, isRunning, clientId]);
  const program = useMemo<ProgramState>(() => {
    const parsed = ProgramStateSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
      console.warn("[program-grid] agent state is not a valid ProgramState", parsed.error.issues.slice(0, 3));
    }
    return emptyProgram(clientId);
  }, [raw, rawJson, clientId]);

  // Highlight cells the agent wrote: diff against the last program we rendered, unless this state is our own write.
  const [touched, setTouched] = useState<ReadonlyMap<string, number>>(new Map());
  const previous = useRef<ProgramState | null>(null);
  const generation = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useLayoutEffect(() => {
    const prev = previous.current;
    previous.current = program;
    if (rawJson === lastLocalWrite.current) return;
    const keys = changedCells(prev, program);
    if (keys.length === 0) return;
    const gen = ++generation.current;
    setTouched((cur) => {
      const next = new Map(cur);
      for (const k of keys) next.set(k, gen);
      return next;
    });
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setTouched((cur) => {
        const next = new Map(cur);
        for (const [k, g] of cur) if (g === gen) next.delete(k);
        return next;
      });
    }, AGENT_TOUCH_MS);
    timers.current.add(timer);
  }, [program, rawJson]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // A new thread clears any highlight left from the old one.
  useEffect(() => setTouched(new Map()), [threadId]);

  const setProgram = useCallback(
    (next: ProgramState) => {
      if (!ProgramStateSchema.safeParse(next).success) return;
      lastLocalWrite.current = JSON.stringify(next);
      agent.setState(next);
    },
    [agent],
  );

  return { program, setProgram, touched, isRunning };
}

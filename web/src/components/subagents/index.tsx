import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { z } from "zod";
import { useRenderTool, type AbstractAgent } from "@copilotkit/react-core/v2";
import { SUBAGENTS, TOOLS, type SubagentReport, type SubagentTask } from "../../lib/contracts";
import { SubagentFeed, reportsFromResult, type FeedEvent, type Lane } from "./feed";
import { SubagentBoard, useNow, type BoardLane } from "./SubagentBoard";

/**
 * Parallel sub-agents in the browser (CONTRACTS section 11).
 *
 * - `SubagentFeedProvider` subscribes to the chat's agent and folds the AG-UI subagent events into lanes.
 * - `useSubagentsTool` renders each runSubagents call as a `SubagentBoard`, tied to its lanes by `parentToolCallId`.
 * - `isSubagentMessage` / `dropSubagentMessages` keep sub-agent messages out of the chat transcript and the request.
 */

const FeedContext = createContext<SubagentFeed | null>(null);

export function SubagentFeedProvider({ agent, children }: { agent: AbstractAgent; children: ReactNode }) {
  const [feed] = useState(() => new SubagentFeed());
  useEffect(() => {
    // onEvent sees every event before it is applied; returning nothing leaves the event untouched, so CopilotKit
    // (and the Web Inspector) still get all of them.
    const sub = agent.subscribe({ onEvent: ({ event }) => feed.apply(event as FeedEvent) });
    return () => sub.unsubscribe();
  }, [agent, feed]);
  return <FeedContext value={feed}>{children}</FeedContext>;
}

function useLanes(parentToolCallId: string): Lane[] {
  const feed = useContext(FeedContext);
  const empty = useMemo(() => new SubagentFeed(), []);
  const source = feed ?? empty;
  const all = useSyncExternalStore(source.subscribe, source.getSnapshot);
  return useMemo(() => all.filter((l) => l.parentToolCallId === parentToolCallId), [all, parentToolCallId]);
}

/** A message a sub-agent produced. AG-UI keeps its `subagentRunId` on the message. */
export function isSubagentMessage(m: unknown): boolean {
  return !!m && typeof m === "object" && typeof (m as { subagentRunId?: unknown }).subagentRunId === "string";
}

/**
 * Sub-agent messages are the sub-agents' own transcripts: their brief (a user message), their tool calls and words.
 * The coach must never read them back as its own turns, so they are dropped from the request body. The coach gets
 * the sub-agents' work through the runSubagents result instead.
 */
export function dropSubagentMessages<T>(messages: T[]): T[] {
  return messages.filter((m) => !isSubagentMessage(m));
}

// Lenient on purpose: this only draws. A malformed call still gets a board (the agent rejects it with an error).
const ArgsSchema = z.object({ tasks: z.array(z.unknown()).optional() }).passthrough();

export function useSubagentsTool(): void {
  useRenderTool({
    name: TOOLS.runSubagents,
    parameters: ArgsSchema,
    render: ({ toolCallId, status, parameters, result }) => (
      <ConnectedSubagentBoard toolCallId={toolCallId} status={status} tasks={parameters?.tasks} result={result} />
    ),
  });
}

function ConnectedSubagentBoard({
  toolCallId,
  status,
  tasks,
  result,
}: {
  toolCallId: string;
  status: "inProgress" | "executing" | "complete";
  tasks: unknown[] | undefined;
  result: string | undefined;
}) {
  const live = useLanes(toolCallId);
  const reports = useMemo(() => reportsFromResult(result), [result]);
  const running = status !== "complete" || live.some((l) => l.status === "running");
  const now = useNow(running);

  // The agent turned the call down (bad task list, toggle off): its error goes back to the model to fix.
  if (status === "complete" && live.length === 0 && reports.length === 0) return null;

  let lanes: BoardLane[];
  if (live.length > 0) lanes = live.map(fromLane);
  else if (reports.length > 0) lanes = reports.map(fromReport);
  else lanes = plannedLanes(tasks);
  if (lanes.length === 0) return null;
  return <SubagentBoard lanes={lanes} now={reports.length > 0 && live.length === 0 ? Math.max(...lanes.map((l) => l.end ?? 0)) : now} />;
}

function fromLane(l: Lane): BoardLane {
  return {
    id: l.id,
    name: l.name,
    kind: l.kind,
    title: l.title,
    status: l.status,
    start: l.startedAt,
    end: l.finishedAt,
    brief: l.brief,
    steps: l.steps,
    writes: l.writes,
    report: l.report,
    error: l.error,
  };
}

/** No live lanes (e.g. the page was not listening): rebuild from the reports. They all started together. */
function fromReport(r: SubagentReport): BoardLane {
  return {
    id: r.subagentRunId,
    name: SUBAGENTS.names[r.kind] ?? r.kind,
    kind: r.kind,
    title: r.title,
    status: r.status,
    start: 0,
    end: r.durationMs,
    brief: "",
    steps: [],
    writes: r.wrote && r.wrote.length > 0 ? 1 : 0,
    report: r,
  };
}

/** While the coach is still writing the call: the tasks it has listed so far, queued. */
function plannedLanes(tasks: unknown[] | undefined): BoardLane[] {
  return (tasks ?? [])
    .filter((t): t is Partial<SubagentTask> => !!t && typeof t === "object")
    .filter((t) => typeof t.kind === "string")
    .map((t, i) => ({
      id: `planned-${i}`,
      name: SUBAGENTS.names[t.kind as SubagentTask["kind"]] ?? String(t.kind),
      kind: (t.kind as SubagentTask["kind"]) ?? "unknown",
      title: plannedTitle(t),
      status: "queued" as const,
      brief: typeof t.brief === "string" ? t.brief : "",
      steps: [],
      writes: 0,
    }));
}

/** Same titles the agent gives SUBAGENT_STARTED.description. */
function plannedTitle(t: Partial<SubagentTask>): string {
  if (t.kind === "build-day") return `Week ${t.week ?? "?"} · ${t.day ?? "?"} · ${t.focus ?? ""}`;
  if (t.kind === "build-week") return `Week ${t.week ?? "?"}`;
  return "Injury screen";
}

export { SubagentBoard } from "./SubagentBoard";
export { SubagentsToggle } from "./SubagentsToggle";

/**
 * SubagentFeed: turns the AG-UI 1.0 subagent events in a thread's stream into lanes, one per sub-agent
 * (CONTRACTS section 11). It reads:
 *
 * - SUBAGENT_STARTED / SUBAGENT_FINISHED / SUBAGENT_ERROR (the lifecycle; not stored in agent.messages),
 * - every event carrying a `subagentRunId` (the sub-agent's brief, words, tool calls and grid writes),
 * - RUN_FINISHED / RUN_ERROR (a run that ends with a lane still running stops that lane).
 *
 * No runtime imports, so `node --test` can load it directly (see feed.test.mjs).
 */
import type { SubagentKind, SubagentReport } from "../../lib/contracts";

export type LaneStatus = "running" | "done" | "error";

export interface ToolStep {
  kind: "tool";
  id: string;
  name: string;
  /** The arguments JSON as streamed so far. */
  args: string;
  /** The result text (trimmed by the agent), once it arrives. */
  result?: string;
  at: number;
}

export interface TextStep {
  kind: "text";
  id: string;
  text: string;
  done: boolean;
  at: number;
}

export type LaneStep = ToolStep | TextStep;

export interface Lane {
  id: string;
  /** SUBAGENT_STARTED.name, e.g. "day-builder". */
  name: string;
  kind: SubagentKind | "unknown";
  /** SUBAGENT_STARTED.description, e.g. "Week 1 · Mon · Lower". */
  title: string;
  parentToolCallId?: string;
  status: LaneStatus;
  /** Browser clock (ms), so the live bars line up with `Date.now()`. */
  startedAt: number;
  finishedAt?: number;
  brief: string;
  steps: LaneStep[];
  /** STATE_SNAPSHOTs this sub-agent sent (its grid writes). */
  writes: number;
  report?: SubagentReport;
  error?: string;
}

/** The fields of the AG-UI events the feed reads. Anything else is ignored. */
export interface FeedEvent {
  type: string;
  subagentRunId?: string;
  name?: string;
  description?: string;
  parentToolCallId?: string;
  messageId?: string;
  role?: string;
  delta?: string;
  toolCallId?: string;
  toolCallName?: string;
  content?: unknown;
  result?: unknown;
  message?: string;
}

const KIND_BY_NAME: Record<string, SubagentKind> = {
  "day-builder": "build-day",
  "week-builder": "build-week",
  "injury-screen": "injury-screen",
};

export const STOPPED = "Stopped: the run ended before this sub-agent finished.";

export class SubagentFeed {
  private lanes = new Map<string, Lane>();
  /** messageId -> what it is, for TEXT_MESSAGE_CONTENT (which carries no role). */
  private messages = new Map<string, "brief" | "text">();
  private listeners = new Set<() => void>();
  private snapshot: readonly Lane[] = [];

  /** For useSyncExternalStore. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** For useSyncExternalStore: a new array whenever any lane changes, otherwise the same one. */
  getSnapshot = (): readonly Lane[] => this.snapshot;

  /** The lanes started by one runSubagents call, in start order. */
  lanesFor(parentToolCallId: string): Lane[] {
    return this.snapshot.filter((l) => l.parentToolCallId === parentToolCallId);
  }

  apply(event: FeedEvent, now: number = Date.now()): void {
    switch (event.type) {
      case "SUBAGENT_STARTED": {
        if (!event.subagentRunId || this.lanes.has(event.subagentRunId)) return;
        const name = event.name ?? "sub-agent";
        this.lanes.set(event.subagentRunId, {
          id: event.subagentRunId,
          name,
          kind: KIND_BY_NAME[name] ?? "unknown",
          title: event.description ?? name,
          parentToolCallId: event.parentToolCallId,
          status: "running",
          startedAt: now,
          brief: "",
          steps: [],
          writes: 0,
        });
        return this.changed();
      }
      case "SUBAGENT_FINISHED":
        return this.update(event.subagentRunId, (l) => ({
          ...l,
          status: "done",
          finishedAt: now,
          report: asReport(event.result) ?? l.report,
          steps: closeText(l.steps),
        }));
      case "SUBAGENT_ERROR":
        return this.update(event.subagentRunId, (l) => ({
          ...l,
          status: "error",
          finishedAt: now,
          error: event.message ?? "The sub-agent failed.",
          steps: closeText(l.steps),
        }));
      case "RUN_FINISHED":
      case "RUN_ERROR": {
        let any = false;
        for (const [id, l] of this.lanes) {
          if (l.status !== "running") continue;
          this.lanes.set(id, { ...l, status: "error", finishedAt: now, error: STOPPED, steps: closeText(l.steps) });
          any = true;
        }
        if (any) this.changed();
        return;
      }
    }

    const id = event.subagentRunId;
    if (!id || !this.lanes.has(id)) return;
    switch (event.type) {
      case "TEXT_MESSAGE_START": {
        if (!event.messageId) return;
        const brief = event.role === "user";
        this.messages.set(event.messageId, brief ? "brief" : "text");
        if (brief) return;
        const step: TextStep = { kind: "text", id: event.messageId, text: "", done: false, at: now };
        return this.update(id, (l) => ({ ...l, steps: [...l.steps, step] }));
      }
      case "TEXT_MESSAGE_CONTENT": {
        const messageId = event.messageId;
        const delta = event.delta ?? "";
        if (!messageId || !delta) return;
        if (this.messages.get(messageId) === "brief") return this.update(id, (l) => ({ ...l, brief: l.brief + delta }));
        return this.update(id, (l) => ({
          ...l,
          steps: l.steps.map((s) => (s.kind === "text" && s.id === messageId ? { ...s, text: s.text + delta } : s)),
        }));
      }
      case "TEXT_MESSAGE_END":
        return this.update(id, (l) => ({
          ...l,
          steps: l.steps.map((s) => (s.kind === "text" && s.id === event.messageId ? { ...s, done: true } : s)),
        }));
      case "TOOL_CALL_START": {
        if (!event.toolCallId) return;
        const step: ToolStep = { kind: "tool", id: event.toolCallId, name: event.toolCallName ?? "tool", args: "", at: now };
        return this.update(id, (l) => ({ ...l, steps: [...l.steps, step] }));
      }
      case "TOOL_CALL_ARGS":
        return this.updateTool(id, event.toolCallId, (s) => ({ ...s, args: s.args + (event.delta ?? "") }));
      case "TOOL_CALL_RESULT":
        return this.updateTool(id, event.toolCallId, (s) => ({ ...s, result: contentText(event.content) }));
      case "STATE_SNAPSHOT":
        return this.update(id, (l) => ({ ...l, writes: l.writes + 1 }));
    }
  }

  private updateTool(laneId: string, toolCallId: string | undefined, fn: (s: ToolStep) => ToolStep): void {
    if (!toolCallId) return;
    this.update(laneId, (l) => ({
      ...l,
      steps: l.steps.map((s) => (s.kind === "tool" && s.id === toolCallId ? fn(s) : s)),
    }));
  }

  private update(id: string | undefined, fn: (l: Lane) => Lane): void {
    const lane = id ? this.lanes.get(id) : undefined;
    if (!lane || !id) return;
    this.lanes.set(id, fn(lane));
    this.changed();
  }

  private changed(): void {
    this.snapshot = [...this.lanes.values()];
    for (const l of this.listeners) l();
  }
}

function closeText(steps: LaneStep[]): LaneStep[] {
  return steps.map((s) => (s.kind === "text" && !s.done ? { ...s, done: true } : s));
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
}

/** Light check of SUBAGENT_FINISHED.result: it's display data, so a bad one is just left out. */
export function asReport(value: unknown): SubagentReport | undefined {
  if (!value || typeof value !== "object") return undefined;
  const r = value as Partial<SubagentReport>;
  return typeof r.subagentRunId === "string" && typeof r.status === "string" && typeof r.summary === "string"
    ? (r as SubagentReport)
    : undefined;
}

/** The runSubagents result's `reports`, for a board whose live lanes are gone (e.g. the feed was not attached). */
export function reportsFromResult(result: string | undefined): SubagentReport[] {
  if (!result) return [];
  try {
    const parsed = JSON.parse(result) as { reports?: unknown };
    return Array.isArray(parsed.reports) ? parsed.reports.map(asReport).filter((r): r is SubagentReport => !!r) : [];
  } catch {
    return [];
  }
}

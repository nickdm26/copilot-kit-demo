import { useEffect, useState } from "react";
import { TEST_IDS, TOOLS, type SubagentKind, type SubagentReport } from "../../lib/contracts";
import { Badge, cx } from "../ui";
import { findExercise } from "../genui/exercises";
import type { LaneStep } from "./feed";

/** One row of the board, whatever it was built from (live lanes, the tool's args, or its final result). */
export interface BoardLane {
  id: string;
  name: string;
  kind: SubagentKind | "unknown";
  title: string;
  status: "queued" | "running" | "done" | "error";
  /** ms on the board's own clock; undefined while queued. */
  start?: number;
  end?: number;
  brief: string;
  steps: LaneStep[];
  writes: number;
  report?: SubagentReport;
  error?: string;
}

export interface SubagentBoardProps {
  lanes: BoardLane[];
  /** "now" on the same clock as the lanes, for running bars and the live clock. */
  now: number;
}

/**
 * The inline chat card for one runSubagents call: one lane per sub-agent on a shared timeline, so the trainer (and
 * the engineers watching) can see them run side by side. Each lane opens to show its brief, every tool call it made
 * and its words. Theme utilities only: it renders inside the chat, where CopilotKit redefines --accent and --border.
 */
export function SubagentBoard({ lanes, now }: SubagentBoardProps) {
  const running = lanes.filter((l) => l.status === "running").length;
  const queued = lanes.filter((l) => l.status === "queued").length;
  const failed = lanes.filter((l) => l.status === "error").length;
  const done = lanes.filter((l) => l.status === "done").length;
  const active = running > 0 || queued > 0;

  const starts = lanes.map((l) => l.start).filter((t): t is number => t !== undefined);
  const t0 = starts.length ? Math.min(...starts) : now;
  const ends = lanes.map((l) => l.end ?? (l.start !== undefined ? now : undefined)).filter((t): t is number => t !== undefined);
  const t1 = Math.max(t0 + 1, ...ends);
  const wall = starts.length ? t1 - t0 : 0;
  const work = lanes.reduce((sum, l) => sum + (l.start !== undefined ? (l.end ?? now) - l.start : 0), 0);
  const speedup = wall > 0 ? work / wall : 0;

  const toolCalls = lanes.reduce((n, l) => n + l.steps.filter((s) => s.kind === "tool").length, 0);
  const writes = lanes.reduce((n, l) => n + l.writes, 0);
  const risky = [...new Set(lanes.flatMap((l) => l.report?.riskyLifts ?? []))];
  const tokens = lanes.reduce((n, l) => n + (l.report?.inputTokens ?? 0) + (l.report?.outputTokens ?? 0), 0);

  return (
    <section
      data-testid={TEST_IDS.subagentBoard}
      data-state={active ? "running" : "done"}
      data-count={lanes.length}
      aria-label="Parallel sub-agents"
      className="my-2 overflow-hidden rounded-md border border-border bg-surface text-ink"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3.5 py-2.5">
        <ForkIcon />
        <h3 className="font-heading text-lg uppercase leading-none tracking-wide">Sub-agents</h3>
        {active ? (
          <Badge tone="accent">{running > 0 ? `${running} running` : `${queued} starting`}</Badge>
        ) : failed > 0 ? (
          <Badge tone="flag">{failed} failed</Badge>
        ) : (
          <Badge tone="ok">{done} done</Badge>
        )}
        <span className="ml-auto text-xs text-ink-muted tabular-nums" title="Wall-clock time since the first sub-agent started">
          {starts.length ? seconds(wall) : "—"}
          {speedup >= 1.15 ? (
            <span title={`${seconds(work)} of sub-agent work in ${seconds(wall)}`}> · {speedup.toFixed(1)}× parallel</span>
          ) : null}
        </span>
      </header>

      <ol className="divide-y divide-border">
        {lanes.map((lane) => (
          <LaneRow key={lane.id} lane={lane} t0={t0} t1={t1} now={now} />
        ))}
      </ol>

      {!active && lanes.length > 0 ? (
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-bg px-3.5 py-2 text-xs text-ink-muted">
          <span className="tabular-nums">
            {toolCalls} tool {toolCalls === 1 ? "call" : "calls"} · {writes} grid {writes === 1 ? "write" : "writes"}
            {tokens > 0 ? ` · ${compact(tokens)} tokens` : ""}
          </span>
          {risky.map((id) => (
            <Badge key={id} tone="flag">
              {findExercise(id)?.name ?? id}
            </Badge>
          ))}
        </footer>
      ) : null}
    </section>
  );
}

function LaneRow({ lane, t0, t1, now }: { lane: BoardLane; t0: number; t1: number; now: number }) {
  const [open, setOpen] = useState(false);
  const span = t1 - t0;
  const start = lane.start ?? t0;
  const end = lane.end ?? (lane.start !== undefined ? now : start);
  const left = ((start - t0) / span) * 100;
  const width = Math.max(1.5, ((end - start) / span) * 100);
  const duration = lane.report?.durationMs ?? (lane.start !== undefined ? end - start : undefined);
  const detailId = `subagent-${lane.id}`;

  return (
    <li
      data-testid={TEST_IDS.subagentLane}
      data-subagent-run-id={lane.id}
      data-kind={lane.kind}
      data-status={lane.status}
      className="px-3.5 py-2.5"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "flex w-full cursor-pointer flex-col gap-1.5 text-left",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        <span className="flex w-full items-center gap-2">
          <StatusDot status={lane.status} />
          <span className="shrink-0 rounded-sm border border-border bg-bg px-1.5 py-px font-mono text-[11px] leading-4 text-ink-muted">
            {lane.name}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{lane.title}</span>
          <span className="shrink-0 text-xs text-ink-muted tabular-nums">
            {duration !== undefined ? seconds(duration) : lane.status === "queued" ? "queued" : ""}
          </span>
          <Chevron open={open} />
        </span>
        <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-bg" aria-hidden="true">
          {lane.status !== "queued" ? (
            <span
              className={cx(
                "absolute inset-y-0 rounded-full transition-[width] duration-100",
                lane.status === "running" && "bg-accent",
                lane.status === "done" && "bg-ok",
                lane.status === "error" && "bg-flag",
              )}
              style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
            />
          ) : null}
        </span>
        <span className={cx("block truncate text-xs", lane.status === "error" ? "text-flag" : "text-ink-muted")}>
          {activity(lane)}
        </span>
      </button>

      {open ? (
        <div id={detailId} className="mt-2.5 flex flex-col gap-2 border-l-2 border-border pl-3 text-xs">
          {lane.brief ? (
            <p className="text-ink-muted">
              <span className="font-medium text-ink">Brief</span> · {lane.brief}
            </p>
          ) : null}
          {lane.steps.map((step) =>
            step.kind === "tool" ? (
              <ToolStepRow key={step.id} step={step} />
            ) : step.text ? (
              <p key={step.id} className="leading-5 text-ink">
                {step.text}
                {!step.done ? <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-accent align-middle" /> : null}
              </p>
            ) : null,
          )}
          {lane.error ? <p className="text-flag">{lane.error}</p> : null}
          {lane.report && (lane.report.inputTokens || lane.report.outputTokens) ? (
            <p className="text-ink-muted tabular-nums">
              {compact(lane.report.inputTokens ?? 0)} in · {compact(lane.report.outputTokens ?? 0)} out tokens
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ToolStepRow({ step }: { step: Extract<LaneStep, { kind: "tool" }> }) {
  const args = parse(step.args);
  const failed = typeof step.result === "string" && step.result.startsWith("Error");
  return (
    <div className="flex flex-col gap-0.5">
      <code className="break-words font-mono text-[11px] leading-4 text-ink">
        <span className="text-accent">→</span> {step.name}
        <span className="text-ink-muted">({argSummary(step.name, args)})</span>
      </code>
      {step.result !== undefined ? (
        <span className={cx("pl-3.5 font-mono text-[11px] leading-4", failed ? "text-flag" : "text-ok")}>
          {failed ? "✕" : "✓"} {resultSummary(step.name, step.result)}
        </span>
      ) : (
        <span className="pl-3.5 font-mono text-[11px] leading-4 text-ink-muted">…</span>
      )}
    </div>
  );
}

/** The one line under the bar: what the lane is doing now, or what it came back with. */
function activity(lane: BoardLane): string {
  if (lane.status === "queued") return lane.brief || "Waiting to start";
  if (lane.status === "error") return lane.error ?? "Failed";
  if (lane.status === "done") return lane.report?.summary || lastText(lane) || "Done";
  const last = lane.steps[lane.steps.length - 1];
  if (!last) return lane.brief ? `Reading the brief: ${lane.brief}` : "Starting";
  if (last.kind === "text") return last.text || "Thinking";
  const args = parse(last.args);
  return `${last.result === undefined ? "Calling" : "Called"} ${last.name}(${argSummary(last.name, args)})`;
}

function lastText(lane: BoardLane): string {
  const texts = lane.steps.filter((s): s is Extract<LaneStep, { kind: "text" }> => s.kind === "text" && !!s.text);
  return texts[texts.length - 1]?.text ?? "";
}

type Json = Record<string, unknown>;

function parse(json: string): Json | null {
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}

function exercisesSummary(list: unknown): string {
  if (!Array.isArray(list)) return "";
  return list
    .map((e) => {
      const x = (e ?? {}) as Json;
      const name = findExercise(typeof x.exerciseId === "string" ? x.exerciseId : undefined)?.name ?? String(x.exerciseId ?? "?");
      return x.sets && x.reps ? `${name} ${String(x.sets)}×${String(x.reps)}` : name;
    })
    .join(", ");
}

function argSummary(tool: string, args: Json | null): string {
  if (!args) return "";
  if (tool === TOOLS.writeDay) {
    const n = Array.isArray(args.exercises) ? args.exercises.length : 0;
    return `${String(args.focus ?? "")} · ${n} exercises: ${exercisesSummary(args.exercises)}`;
  }
  if (tool === TOOLS.writeWeek) {
    const days = Array.isArray(args.days) ? (args.days as Json[]) : [];
    return days.map((d) => `${String(d.day)} ${String(d.focus ?? "")}`).join(", ");
  }
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
}

function resultSummary(tool: string, result: string): string {
  if (tool === TOOLS.searchExercises) {
    try {
      const list: unknown = JSON.parse(result);
      if (Array.isArray(list)) {
        const names = list.slice(0, 3).map((e) => String((e as Json).name ?? (e as Json).id));
        return `${list.length} results${names.length ? `: ${names.join(", ")}${list.length > 3 ? "…" : ""}` : ""}`;
      }
    } catch {
      /* trimmed on the wire; fall through */
    }
    return "results";
  }
  if (tool === TOOLS.writeDay || tool === TOOLS.writeWeek) {
    return result.startsWith("ok") ? "written to the grid" : result.slice(0, 160);
  }
  return result.slice(0, 160);
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function StatusDot({ status }: { status: BoardLane["status"] }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-label={status}>
      {status === "running" ? <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" /> : null}
      <span
        className={cx(
          "relative h-2.5 w-2.5 rounded-full",
          status === "queued" && "border border-border bg-bg",
          status === "running" && "bg-accent",
          status === "done" && "bg-ok",
          status === "error" && "bg-flag",
        )}
      />
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" className={cx("shrink-0 text-ink-muted transition-transform", open && "rotate-90")}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent">
      <path d="M6 3v6a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v6M6 21V9M18 3v3" />
    </svg>
  );
}

/** A clock that ticks every 100 ms while `active`, for running bars. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

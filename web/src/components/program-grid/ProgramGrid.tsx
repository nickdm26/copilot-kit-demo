import { useEffect, useMemo, useState, type DragEvent } from "react";
import { z } from "zod";
import exercisesJson from "@seed/exercises.json";
import {
  ExerciseEntrySchema,
  ExerciseSchema,
  TEST_IDS,
  type Day,
  type ExerciseEntry,
  type ProgramState,
  type WeekDay,
} from "../../lib/contracts";
import { useSession } from "../../lib/session";
import { Badge, Card, cx } from "../ui";
import { MobileDayView, PendingChangesBanner, type DayViewDay } from "../program";
import { usePendingApprovals } from "../agent/pendingApprovals";
import { useMobileNav } from "../../layouts/mobileNav";
import { cellKey, editCell, moveDayContent, type CellField } from "./applyUpdate";
import { useProgramState } from "./useProgramState";

const exerciseNames = new Map(z.array(ExerciseSchema).parse(exercisesJson).map((e) => [e.id, e.name]));
const nameOf = (id: string) => exerciseNames.get(id) ?? id;

const DRAG_TYPE = "application/x-pt-day";

const GOAL_LABELS: Record<ProgramState["goal"], string> = {
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  general: "General",
  "endurance-support": "Endurance support",
};

export interface ProgramGridProps {
  /** "table": every day of the week side by side (desktop). "day": one day at a time as cards (phone). */
  variant?: "table" | "day";
  className?: string;
}

/** The program: the selected week's days with editable cells, a week switcher on top. */
export default function ProgramGrid({ variant = "table", className }: ProgramGridProps) {
  const { modelKey, threadId, clientId } = useSession();
  // useAgent needs a real agent id; the model list loads first.
  if (!modelKey)
    return (
      <GridFrame week={null} title="Program" className={className}>
        <EmptyState text="Loading models..." />
      </GridFrame>
    );
  return (
    <BoundGrid
      key={modelKey}
      agentId={modelKey}
      threadId={threadId}
      clientId={clientId}
      variant={variant}
      className={className}
    />
  );
}

interface BoundGridProps {
  agentId: string;
  threadId: string;
  clientId: string;
  variant: "table" | "day";
  className?: string;
}

function BoundGrid({ agentId, threadId, clientId, variant, className }: BoundGridProps) {
  const { program, setProgram, touched, isRunning } = useProgramState(agentId, threadId, clientId);
  const weekNumbers = program.weeks.map((w) => w.week);
  const [selected, setSelected] = useState<number | null>(null);
  const week = selected !== null && weekNumbers.includes(selected) ? selected : (weekNumbers[0] ?? null);
  useEffect(() => setSelected(null), [threadId]);

  const flags = useMemo(() => new Map(program.flags.map((f) => [f.exerciseId, f.reason])), [program.flags]);
  const days = program.weeks.find((w) => w.week === week)?.days ?? [];
  const touchedWeeks = useMemo(() => new Set([...touched.keys()].map((k) => Number(k.split("|")[0]))), [touched]);

  const title =
    weekNumbers.length > 0
      ? `${GOAL_LABELS[program.goal]} block · ${weekNumbers.length} ${weekNumbers.length === 1 ? "week" : "weeks"}`
      : "Program";
  const onEdit: WeekTableProps["onEdit"] = (day, index, field, value) => {
    if (week !== null) setProgram(editCell(program, week, day, index, field, value));
  };

  if (week === null) {
    return (
      <GridFrame week={null} title={title} className={className}>
        {variant === "day" ? <MobilePendingBanner className="mb-3" /> : null}
        <EmptyState
          text={
            isRunning
              ? "The coach is planning. The program will fill in here day by day."
              : "No program yet. Ask the coach for one, e.g. \"4 week strength block for Sarah, 3 days a week\"."
          }
        />
      </GridFrame>
    );
  }

  if (variant === "day") {
    return (
      <section data-testid={TEST_IDS.programGrid} data-week={week} className={cx("min-w-0", className)}>
        <DayView
          week={week}
          weekNumbers={weekNumbers}
          days={days}
          flags={flags}
          touched={touched}
          goal={GOAL_LABELS[program.goal]}
          onWeekChange={setSelected}
          onEdit={onEdit}
        />
      </section>
    );
  }

  const weekTabs = (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Weeks">
      {weekNumbers.map((n) => (
        <button
          key={n}
          type="button"
          role="tab"
          data-testid={TEST_IDS.weekTab}
          data-week={n}
          aria-selected={n === week}
          onClick={() => setSelected(n)}
          className={cx(
            "relative h-8 px-2.5 rounded-sm border text-[13px] cursor-pointer tabular transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            n === week
              ? "bg-ink border-ink text-surface font-semibold"
              : "bg-surface border-border text-ink-muted hover:text-ink",
          )}
        >
          Wk {n}
          {touchedWeeks.has(n) && n !== week ? (
            <>
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
              <span className="sr-only"> (updated)</span>
            </>
          ) : null}
        </button>
      ))}
    </div>
  );

  return (
    <GridFrame week={week} title={title} actions={weekTabs} className={className}>
      <WeekTable
        week={week}
        days={days}
        flags={flags}
        touched={touched}
        onEdit={onEdit}
        onMove={(from, to) => setProgram(moveDayContent(program, week, from, to))}
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3.5 w-3.5 rounded-[4px] border border-accent bg-accent-tint" />
          Agent edit, fades after 2s
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-flag" />
          Flag, needs coach review
        </span>
        <span className="ml-auto">
          {isRunning ? "Coach is writing..." : "Edit sets, reps or RPE. Drag a day header to swap days."}
        </span>
      </div>
    </GridFrame>
  );
}

function GridFrame({
  week,
  title,
  actions,
  className,
  children,
}: {
  week: number | null;
  title: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={TEST_IDS.programGrid}
      data-week={week ?? ""}
      className={cx("flex min-w-0 min-h-0 flex-col gap-3.5 p-4 overflow-y-auto overscroll-contain", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl uppercase tracking-wide leading-tight">{title}</h2>
        {actions}
      </div>
      <div>{children}</div>
    </section>
  );
}

/* ---------- Phone: one day at a time ---------- */

/** "Coach agent proposed N changes" while an approval card waits; tapping it opens the Coach tab. */
function MobilePendingBanner({ className }: { className?: string }) {
  const pending = usePendingApprovals();
  const goTo = useMobileNav();
  const count = pending.reduce((n, p) => n + p.count, 0);
  return count > 0 ? <PendingChangesBanner count={count} onReview={() => goTo("coach")} className={className} /> : null;
}

interface DayViewProps {
  week: number;
  weekNumbers: number[];
  days: Day[];
  flags: ReadonlyMap<string, string>;
  touched: ReadonlyMap<string, number>;
  goal: string;
  onWeekChange: (week: number) => void;
  onEdit: WeekTableProps["onEdit"];
}

function DayView({ week, weekNumbers, days, flags, touched, goal, onWeekChange, onEdit }: DayViewProps) {
  const { clients, clientId } = useSession();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const viewDays: DayViewDay[] = days.map((d) => ({
    value: d.day,
    label: d.focus ? `${d.day} · ${d.focus}` : d.day,
    exercises: d.exercises.map((entry, index) => {
      const gen = touched.get(cellKey(week, d.day, index));
      const flagReason = flags.get(entry.exerciseId);
      return {
        // A new highlight generation remounts the card so the fade restarts.
        key: `${index}-${gen ?? 0}`,
        slot: String(index + 1),
        name: nameOf(entry.exerciseId),
        prescription: `${entry.sets} x ${entry.reps} @ RPE ${entry.rpe}`,
        flagReason,
        agentEdited: gen !== undefined,
        cardProps: {
          "data-testid": TEST_IDS.gridCell,
          "data-week": String(week),
          "data-day": d.day,
          "data-index": String(index),
          "data-exercise-id": entry.exerciseId,
          "data-flagged": flagReason !== undefined ? "true" : "false",
          "data-agent-touched": gen !== undefined ? "true" : "false",
        },
        editor: (
          <div className="flex items-center gap-1 text-sm">
            <NumberField label="Sets" field="sets" value={entry.sets} width="w-11" onCommit={(v) => onEdit(d.day, index, "sets", v)} />
            <span className="text-ink-muted">x</span>
            <RepsField value={entry.reps} onCommit={(v) => onEdit(d.day, index, "reps", v)} />
            <span className="text-ink-muted">@ RPE</span>
            <NumberField label="RPE" field="rpe" value={entry.rpe} width="w-12" onCommit={(v) => onEdit(d.day, index, "rpe", v)} />
          </div>
        ),
      };
    }),
  }));

  return (
    <MobileDayView
      eyebrow={`${goal} block · Wk ${week} of ${weekNumbers.length}`}
      title={clients.find((c) => c.id === clientId)?.name ?? ""}
      weeks={weekNumbers.map((n) => ({
        value: n,
        label: `Wk ${n}`,
        optionProps: { "data-testid": TEST_IDS.weekTab, "data-week": String(n), "aria-selected": n === week },
      }))}
      selectedWeek={week}
      onWeekChange={onWeekChange}
      days={viewDays}
      selectedDay={selectedDay ?? days[0]?.day ?? ""}
      onDayChange={setSelectedDay}
      banner={<MobilePendingBanner />}
    />
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="text-sm text-ink-muted">
      <p>{text}</p>
    </Card>
  );
}

interface WeekTableProps {
  week: number;
  days: Day[];
  flags: ReadonlyMap<string, string>;
  touched: ReadonlyMap<string, number>;
  onEdit: <F extends CellField>(day: WeekDay, index: number, field: F, value: ExerciseEntry[F]) => void;
  onMove: (from: WeekDay, to: WeekDay) => void;
}

function WeekTable({ week, days, flags, touched, onEdit, onMove }: WeekTableProps) {
  const rows = Math.max(1, ...days.map((d) => d.exercises.length));
  const [dragOver, setDragOver] = useState<WeekDay | null>(null);

  const onDragStart = (e: DragEvent, day: WeekDay) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ week, day }));
    e.dataTransfer.setData("text/plain", day);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e: DragEvent, to: WeekDay) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const src = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as { week: number; day: WeekDay };
      if (src.week === week) onMove(src.day, to);
    } catch {
      /* not one of our drags */
    }
  };

  return (
      <div className="overflow-x-auto max-w-full">
        <div
          className="grid border border-border rounded-md bg-surface min-w-fit"
          style={{ gridTemplateColumns: `2.5rem repeat(${days.length}, minmax(10rem, 1fr))` }}
        >
        <div className="border-b border-border" />
        {days.map((d) => (
        <div
          key={d.day}
          data-testid={TEST_IDS.gridDay}
          data-week={week}
          data-day={d.day}
          draggable
          onDragStart={(e) => onDragStart(e, d.day)}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOver(d.day);
          }}
          onDragLeave={() => setDragOver((cur) => (cur === d.day ? null : cur))}
          onDrop={(e) => onDrop(e, d.day)}
          title="Drag onto another day to swap them"
          className={cx(
            "px-3 py-2 border-b border-l border-border cursor-grab select-none",
            dragOver === d.day && "bg-accent-tint",
          )}
        >
          <div className="font-heading text-[15px] uppercase tracking-wide text-ink-muted truncate">
            {d.day}
            {d.focus ? ` · ${d.focus}` : ""}
          </div>
        </div>
      ))}

      {Array.from({ length: rows }, (_, i) => (
        <Row key={i} index={i} week={week} days={days} flags={flags} touched={touched} onEdit={onEdit} />
      ))}
    </div>
          </div>
        );
      }

function Row({ index, week, days, flags, touched, onEdit }: Omit<WeekTableProps, "onMove"> & { index: number }) {
  return (
    <>
      <div className="px-2 py-2 border-t border-border text-xs text-ink-muted tabular">{index + 1}</div>
      {days.map((d) => {
        const entry = d.exercises[index];
        if (!entry) return <div key={d.day} className="border-t border-l border-border" />;
        const key = cellKey(week, d.day, index);
        const gen = touched.get(key);
        return (
          <Cell
            // A new generation remounts the cell so the highlight animation restarts.
            key={`${d.day}-${gen ?? 0}`}
            week={week}
            day={d.day}
            index={index}
            entry={entry}
            flagReason={flags.get(entry.exerciseId)}
            touched={gen !== undefined}
            onEdit={onEdit}
          />
        );
      })}
    </>
  );
}

interface CellProps {
  week: number;
  day: WeekDay;
  index: number;
  entry: ExerciseEntry;
  flagReason: string | undefined;
  touched: boolean;
  onEdit: WeekTableProps["onEdit"];
}

function Cell({ week, day, index, entry, flagReason, touched, onEdit }: CellProps) {
  const flagged = flagReason !== undefined;
  return (
    <div
      data-testid={TEST_IDS.gridCell}
      data-week={week}
      data-day={day}
      data-index={index}
      data-exercise-id={entry.exerciseId}
      data-flagged={flagged ? "true" : "false"}
      data-agent-touched={touched ? "true" : "false"}
      title={flagged ? `Flagged: ${flagReason}` : entry.note || undefined}
      className={cx(
        "px-3 py-2 border-t border-l border-border min-w-0",
        touched && "agent-touched",
      )}
    >
      <div className="flex items-start gap-1">
        <span className="text-sm font-medium leading-5 truncate" title={nameOf(entry.exerciseId)}>
          {nameOf(entry.exerciseId)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-sm">
        <NumberField label="Sets" field="sets" value={entry.sets} width="w-9" onCommit={(v) => onEdit(day, index, "sets", v)} />
        <span className="text-ink-muted">x</span>
        <RepsField value={entry.reps} onCommit={(v) => onEdit(day, index, "reps", v)} />
        <span className="text-ink-muted">@</span>
        <NumberField label="RPE" field="rpe" value={entry.rpe} width="w-11" onCommit={(v) => onEdit(day, index, "rpe", v)} />
      </div>
      {flagged ? (
        <Badge tone="flag" className="mt-1.5 max-w-full" title={`Flagged: ${flagReason}`}>
          <span className="truncate">{flagReason}</span>
        </Badge>
      ) : null}
    </div>
  );
}

const inputClass =
  "h-7 rounded-sm border bg-surface px-1 text-center text-sm text-ink tabular focus-visible:outline-2 focus-visible:outline-accent";

/** Text input with a local draft: valid input is written at once, invalid input is marked and never written. */
function useDraft<T>(value: T, parse: (s: string) => T | null, onCommit: (v: T) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  const invalid = draft !== null && parse(draft) === null;
  return {
    value: text,
    "aria-invalid": invalid || undefined,
    className: cx(inputClass, invalid ? "border-flag" : "border-border"),
    onFocus: () => setDraft(String(value)),
    onBlur: () => setDraft(null),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setDraft(next);
      const parsed = parse(next);
      if (parsed !== null && parsed !== value) onCommit(parsed);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
    },
  };
}

const parseSets = (s: string) => (/^\d{1,2}$/.test(s.trim()) ? check(ExerciseEntrySchema.shape.sets, Number(s)) : null);
const parseRpe = (s: string) => (/^\d{1,2}(\.\d)?$/.test(s.trim()) ? check(ExerciseEntrySchema.shape.rpe, Number(s)) : null);
const parseReps = (s: string) => check(ExerciseEntrySchema.shape.reps, s.trim());

function check<T>(schema: z.ZodType<T>, v: unknown): T | null {
  const r = schema.safeParse(v);
  return r.success ? r.data : null;
}

function NumberField({
  label,
  field,
  value,
  width,
  onCommit,
}: {
  label: string;
  field: "sets" | "rpe";
  value: number;
  width: string;
  onCommit: (v: number) => void;
}) {
  const props = useDraft(value, field === "sets" ? parseSets : parseRpe, onCommit);
  return (
    <input
      {...props}
      className={cx(props.className, width)}
      aria-label={label}
      data-field={field}
      inputMode={field === "sets" ? "numeric" : "decimal"}
    />
  );
}

function RepsField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const props = useDraft(value, parseReps, onCommit);
  return <input {...props} className={cx(props.className, "w-14")} aria-label="Reps" data-field="reps" />;
}

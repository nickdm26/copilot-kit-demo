import { useEffect, useMemo, useState, type DragEvent } from "react";
import { z } from "zod";
import exercisesJson from "@seed/exercises.json";
import {
  ExerciseEntrySchema,
  ExerciseSchema,
  TEST_IDS,
  type Day,
  type ExerciseEntry,
  type WeekDay,
} from "../../lib/contracts";
import { useSession } from "../../lib/session";
import { Badge, Card, cx } from "../ui";
import { cellKey, editCell, moveDayContent, type CellField } from "./applyUpdate";
import { useProgramState } from "./useProgramState";

const exerciseNames = new Map(z.array(ExerciseSchema).parse(exercisesJson).map((e) => [e.id, e.name]));
const nameOf = (id: string) => exerciseNames.get(id) ?? id;

const DRAG_TYPE = "application/x-pt-day";

/** The program grid: one row per exercise slot, one column per day of the selected week, a week switcher on top. */
export default function ProgramGrid() {
  const { modelKey, threadId, clientId } = useSession();
  // useAgent needs a real agent id; the model list loads first.
  if (!modelKey) return <GridFrame week={null}><EmptyState text="Loading models..." /></GridFrame>;
  return <BoundGrid key={modelKey} agentId={modelKey} threadId={threadId} clientId={clientId} />;
}

function BoundGrid({ agentId, threadId, clientId }: { agentId: string; threadId: string; clientId: string }) {
  const { program, setProgram, touched, isRunning } = useProgramState(agentId, threadId, clientId);
  const weekNumbers = program.weeks.map((w) => w.week);
  const [selected, setSelected] = useState<number | null>(null);
  const week = selected !== null && weekNumbers.includes(selected) ? selected : (weekNumbers[0] ?? null);
  useEffect(() => setSelected(null), [threadId]);

  const flags = useMemo(() => new Map(program.flags.map((f) => [f.exerciseId, f.reason])), [program.flags]);
  const days = program.weeks.find((w) => w.week === week)?.days ?? [];
  const touchedWeeks = useMemo(() => new Set([...touched.keys()].map((k) => Number(k.split("|")[0]))), [touched]);

  if (week === null) {
    return (
      <GridFrame week={null}>
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

  return (
    <GridFrame week={week}>
      <div className="flex items-center gap-1 sm:gap-2 mb-3 flex-wrap" role="tablist" aria-label="Weeks">
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
                    "h-7 sm:h-8 px-2 sm:px-3 rounded-md border text-xs sm:text-sm font-medium cursor-pointer tabular transition-colors",
              n === week ? "bg-accent-tint border-accent text-ink" : "bg-surface border-border text-ink-muted hover:text-ink",
            )}
          >
                  {n}
            {touchedWeeks.has(n) && n !== week ? <span className="ml-1 text-accent" aria-label="updated">•</span> : null}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-muted">
          {isRunning ? "Coach is writing..." : "Edit sets, reps or RPE. Drag a day header to swap days."}
        </span>
      </div>
      <WeekTable
        week={week}
        days={days}
        flags={flags}
        touched={touched}
        onEdit={(day, index, field, value) => setProgram(editCell(program, week, day, index, field, value))}
        onMove={(from, to) => setProgram(moveDayContent(program, week, from, to))}
      />
    </GridFrame>
  );
}

function GridFrame({ week, children }: { week: number | null; children: React.ReactNode }) {
  return (
    <section data-testid={TEST_IDS.programGrid} data-week={week ?? ""} className="p-3 sm:p-4 min-w-0 min-h-0 overflow-y-auto overscroll-contain">
      <h2 className="font-heading text-lg sm:text-xl uppercase tracking-wide mb-2 sm:mb-3">Program</h2>
      {children}
    </section>
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
          <div className="font-heading text-lg uppercase leading-5">{d.day}</div>
          <div className="text-xs text-ink-muted truncate">{d.focus || " "}</div>
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
        flagged && "bg-flag-tint border-l-flag",
        touched && "agent-touched",
      )}
    >
      <div className="flex items-start gap-1">
        <span className="text-sm font-medium leading-5 truncate" title={nameOf(entry.exerciseId)}>
          {nameOf(entry.exerciseId)}
        </span>
        {flagged ? (
          <Badge tone="flag" className="ml-auto shrink-0" title={flagReason}>
            Flag
          </Badge>
        ) : null}
      </div>
      {flagged ? <div className="text-xs text-flag truncate">{flagReason}</div> : null}
      <div className="mt-1 flex items-center gap-1 text-sm">
        <NumberField label="Sets" field="sets" value={entry.sets} width="w-9" onCommit={(v) => onEdit(day, index, "sets", v)} />
        <span className="text-ink-muted">x</span>
        <RepsField value={entry.reps} onCommit={(v) => onEdit(day, index, "reps", v)} />
        <span className="text-ink-muted">@</span>
        <NumberField label="RPE" field="rpe" value={entry.rpe} width="w-11" onCommit={(v) => onEdit(day, index, "rpe", v)} />
      </div>
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

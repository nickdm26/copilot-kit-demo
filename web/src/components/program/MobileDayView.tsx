import { useState, type ReactNode } from "react";
import { Badge, Select, cx } from "../ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DayViewExercise {
  /** Stable key within the day. */
  key: string;
  /** Row label, e.g. "1" or "A1". */
  slot: string;
  name: string;
  /** e.g. "3 x 4 @ RPE 6". */
  prescription: string;
  /** Flag reason, e.g. "Shoulder history". */
  flagReason?: string;
  /** True while the agent's edit is highlighted. */
  agentEdited?: boolean;
  /** Extra attributes for the card root (data-* for tests). */
  cardProps?: Record<string, string>;
  /** Shown inside the card when it is opened, e.g. sets / reps / RPE inputs. Without it the card doesn't open. */
  editor?: ReactNode;
}

export interface DayViewDay {
  /** Segment text, e.g. "Mon · Lower". */
  label: string;
  /** Value passed to onDayChange. */
  value: string;
  exercises: DayViewExercise[];
}

export interface DayViewWeek {
  value: number;
  label: string;
  /** Extra attributes for the <option> (data-* for tests). */
  optionProps?: Record<string, string | boolean>;
}

export interface MobileDayViewProps {
  /** Small line above the title, e.g. "Strength block · Wk 3 of 6". */
  eyebrow: string;
  /** Large heading, the client name. */
  title: string;
  weeks: DayViewWeek[];
  selectedWeek: number;
  onWeekChange: (week: number) => void;
  days: DayViewDay[];
  selectedDay: string;
  onDayChange: (day: string) => void;
  /** Shown between the day control and the list, e.g. the pending changes banner. */
  banner?: ReactNode;
  /** Shown under the list. */
  footer?: ReactNode;
  className?: string;
}

// ---------------------------------------------------------------------------
// Exercise card
// ---------------------------------------------------------------------------

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("h-[18px] w-[18px] shrink-0 text-ink-muted transition-transform", open && "rotate-90")}
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ExerciseCard({ exercise }: { exercise: DayViewExercise }) {
  const [open, setOpen] = useState(false);
  const canOpen = exercise.editor !== undefined;
  const body = (
    <>
      <span className="font-heading text-[17px] uppercase tracking-wide text-ink-muted w-7 shrink-0 tabular">
        {exercise.slot}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-ink">{exercise.name}</span>
        <span className="tabular text-[13px] text-ink-muted">{exercise.prescription}</span>
        {exercise.flagReason ? (
          <Badge tone="flag" className="mt-1 self-start">
            {exercise.flagReason}
          </Badge>
        ) : null}
        {exercise.agentEdited ? <span className="text-[11px] text-ink-muted">Just updated by agent</span> : null}
      </span>
      {canOpen ? <Chevron open={open} /> : null}
    </>
  );

  return (
    <li
      {...exercise.cardProps}
      className={cx(
        "rounded-md border bg-surface",
        exercise.agentEdited ? "agent-touched border-accent" : "border-border",
      )}
    >
      {canOpen ? (
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${exercise.name}, ${exercise.prescription}. ${open ? "Close" : "Edit"}`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-md p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-16 items-center gap-3 p-3">{body}</div>
      )}
      {open && canOpen ? <div className="border-t border-border px-3 py-2.5">{exercise.editor}</div> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Phone view of one training day: header with the week picker, a segmented control for the days, then the day's
 * exercises as cards. A card opens to its editor when one is given.
 */
export function MobileDayView({
  eyebrow,
  title,
  weeks,
  selectedWeek,
  onWeekChange,
  days,
  selectedDay,
  onDayChange,
  banner,
  footer,
  className,
}: MobileDayViewProps) {
  const day = days.find((d) => d.value === selectedDay) ?? days[0];
  return (
    <div className={cx("flex flex-col gap-3.5 p-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="tabular m-0 text-xs text-ink-muted">{eyebrow}</p>
          <h2 className="m-0 truncate font-heading text-[28px] uppercase leading-[1.1] tracking-wide text-ink">{title}</h2>
        </div>
        <Select
          value={selectedWeek}
          onChange={(e) => onWeekChange(Number(e.target.value))}
          className="tabular h-11 shrink-0"
          aria-label="Week"
        >
          {weeks.map((w) => (
            <option key={w.value} value={w.value} {...w.optionProps}>
              {w.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Segmented day control */}
      <div className="flex rounded-md bg-border p-1" role="tablist" aria-label="Day">
        {days.map((d) => {
          const selected = d.value === day?.value;
          return (
            <button
              key={d.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onDayChange(d.value)}
              className={cx(
                "h-11 min-w-0 flex-1 cursor-pointer truncate rounded-sm px-1 text-[13px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                selected ? "bg-surface font-semibold text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      {banner}

      {/* Exercise list */}
      {day ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {day.exercises.map((exercise) => (
            <ExerciseCard key={exercise.key} exercise={exercise} />
          ))}
        </ul>
      ) : null}

      {footer}
    </div>
  );
}

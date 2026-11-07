import { type ReactNode } from "react";
import { Badge, Select, cx } from "../ui";
import type { FixtureDay, FixtureExercise, FixtureWeekOption } from "./fixtures";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MobileDayViewProps {
  /** The fixture data for the currently selected day. */
  day: FixtureDay;
  /** Available week options for the week Select. */
  weekOptions: FixtureWeekOption[];
  /** Currently selected week value. */
  selectedWeek: number;
  /** Called when the week select changes. */
  onWeekChange: (week: number) => void;
  /** Day labels for the segmented control, e.g. ["Mon", "Wed", "Fri"]. */
  dayLabels: string[];
  /** Currently selected day label. */
  selectedDay: string;
  /** Called when a day tab is tapped. */
  onDayChange: (day: string) => void;
  /** Called when the user taps an exercise card. */
  onExerciseTap?: (exercise: FixtureExercise) => void;
  /** Extra class names. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Chevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-ink-muted"
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function JustUpdatedLabel() {
  return (
    <span className="text-[11px] leading-none text-accent font-medium">
      Just updated by agent
    </span>
  );
}

// ---------------------------------------------------------------------------
// Exercise card
// ---------------------------------------------------------------------------

interface ExerciseCardSmallProps {
  exercise: FixtureExercise;
  onTap?: (exercise: FixtureExercise) => void;
}

function ExerciseCardSmall({ exercise, onTap }: ExerciseCardSmallProps) {
  const flagged = !!exercise.flagReason;

  return (
    <button
      type="button"
      onClick={() => onTap?.(exercise)}
      className={cx(
        "flex w-full items-center gap-3 rounded-md border p-3 text-left cursor-pointer transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        exercise.agentEdited
          ? "border-accent bg-accent-tint agent-touched"
          : "border-border bg-surface hover:border-accent/40",
      )}
    >
      {/* Slot label */}
      <span className="font-heading text-base uppercase tracking-wide text-ink-muted w-7 shrink-0">
        {exercise.slot}
      </span>

      {/* Name + prescription */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{exercise.displayName}</p>
        <p className="text-xs text-ink-muted tabular mt-0.5">
          {exercise.sets} x {exercise.reps} @ RPE {exercise.rpe}
        </p>
        {flagged && (
          <Badge tone="flag" className="mt-1">
            {exercise.flagReason}
          </Badge>
        )}
        {exercise.agentEdited && !flagged && (
          <JustUpdatedLabel />
        )}
      </div>

      {/* Chevron */}
      <Chevron />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Mobile day view showing the selected day's exercises as a list of cards,
 * with a segmented day picker and week selector in the header.
 */
export function MobileDayView({
  day,
  weekOptions,
  selectedWeek,
  onWeekChange,
  dayLabels,
  selectedDay,
  onDayChange,
  onExerciseTap,
  className,
}: MobileDayViewProps) {
  return (
    <div className={cx("flex flex-col gap-4 p-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">
            {day.blockName} · Wk {day.week} of {day.totalWeeks}
          </p>
          <h1 className="font-heading text-2xl uppercase tracking-wide text-ink mt-0.5">
            {day.clientName}
          </h1>
        </div>
        <Select
          value={selectedWeek}
          onChange={(e) => onWeekChange(Number(e.target.value))}
          className="ml-2 shrink-0 text-xs"
          aria-label="Select week"
        >
          {weekOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Segmented day control */}
      <div
        className="flex rounded-lg bg-border p-0.5"
        role="tablist"
        aria-label="Training days"
      >
        {dayLabels.map((label) => {
          const isSelected = label === selectedDay;
          return (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onDayChange(label)}
              className={cx(
                "flex-1 h-9 rounded-md text-sm font-medium cursor-pointer transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                isSelected
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Exercise list */}
      <div className="flex flex-col gap-2">
        {day.exercises.map((exercise, idx) => (
          <ExerciseCardSmall
            key={`${exercise.slot}-${idx}`}
            exercise={exercise}
            onTap={onExerciseTap}
          />
        ))}
      </div>
    </div>
  );
}

// CONTRACTS.md section 1a (applyUpdate) and 1b (trainer edits). Mirrors agent/State/ProgramUpdater.cs.
import type { Day, ExerciseEntry, ProgramState, UpdateProgramArgs, WeekDay } from "../../lib/contracts";

/**
 * 1. clientId / goal / daysPerWeek: overwrite when present.
 * 2. removeDays: delete each matching (week, day); drop a week left with no days.
 * 3. days: find the week (create it if missing, weeks kept sorted); replace the day in place, else append it.
 * 4. flags: when present, replace the whole list.
 * 5. Return the complete new state. The input is not mutated.
 */
export function applyUpdate(state: ProgramState, args: UpdateProgramArgs): ProgramState {
  let weeks = state.weeks.map((w) => ({ week: w.week, days: [...w.days] }));

  for (const r of args.removeDays ?? []) {
    const week = weeks.find((w) => w.week === r.week);
    if (!week) continue;
    const before = week.days.length;
    week.days = week.days.filter((d) => d.day !== r.day);
    if (week.days.length < before && week.days.length === 0) weeks = weeks.filter((w) => w !== week);
  }

  for (const u of args.days ?? []) {
    let week = weeks.find((w) => w.week === u.week);
    if (!week) {
      week = { week: u.week, days: [] };
      const at = weeks.findIndex((w) => w.week > u.week);
      weeks.splice(at < 0 ? weeks.length : at, 0, week);
    }
    const day: Day = { day: u.day, focus: u.focus, exercises: u.exercises };
    const index = week.days.findIndex((d) => d.day === u.day);
    if (index >= 0) week.days[index] = day;
    else week.days.push(day);
  }

  return {
    clientId: args.clientId ?? state.clientId,
    goal: args.goal ?? state.goal,
    daysPerWeek: args.daysPerWeek ?? state.daysPerWeek,
    weeks,
    flags: args.flags ?? state.flags,
  };
}

export type CellField = "sets" | "reps" | "rpe";

/** 1b cell edit: change one entry, return the full state. */
export function editCell<F extends CellField>(
  state: ProgramState,
  week: number,
  day: WeekDay,
  index: number,
  field: F,
  value: ExerciseEntry[F],
): ProgramState {
  const d = state.weeks.find((w) => w.week === week)?.days.find((x) => x.day === day);
  if (!d || !d.exercises[index]) return state;
  const exercises = d.exercises.map((e, i) => (i === index ? { ...e, [field]: value } : e));
  return applyUpdate(state, { days: [{ week, day, focus: d.focus, exercises }] });
}

/**
 * 1b day drag: the day slots keep their labels in their original order; only the content (focus + exercises) moves.
 * Dropping `from` onto `to` swaps the two contents.
 */
export function moveDayContent(state: ProgramState, week: number, from: WeekDay, to: WeekDay): ProgramState {
  const days = state.weeks.find((w) => w.week === week)?.days;
  const a = days?.find((d) => d.day === from);
  const b = days?.find((d) => d.day === to);
  if (!a || !b || from === to) return state;
  return applyUpdate(state, {
    days: [
      { week, day: to, focus: a.focus, exercises: a.exercises },
      { week, day: from, focus: b.focus, exercises: b.exercises },
    ],
  });
}

/** Cell key for highlight tracking. */
export const cellKey = (week: number, day: WeekDay, index: number) => `${week}|${day}|${index}`;

/** Cells (by key) whose entry differs from `prev`, or that are new. */
export function changedCells(prev: ProgramState | null, next: ProgramState): string[] {
  const before = new Map<string, string>();
  for (const w of prev?.weeks ?? [])
    for (const d of w.days) d.exercises.forEach((e, i) => before.set(cellKey(w.week, d.day, i), JSON.stringify(e)));
  const changed: string[] = [];
  for (const w of next.weeks)
    for (const d of w.days)
      d.exercises.forEach((e, i) => {
        const k = cellKey(w.week, d.day, i);
        if (before.get(k) !== JSON.stringify(e)) changed.push(k);
      });
  return changed;
}

import type { DiffRow, ProgramDiffCardProps } from "./ProgramDiffCard";

export const AROHA_ROWS: DiffRow[] = [
  { cell: "Day 1 · A1", before: "Back Squat 4 x 6 @ RPE 8", after: "Back Squat 4 x 5 @ RPE 7" },
  { cell: "Day 3 · A1", before: "Front Squat 3 x 6 @ RPE 7", after: "Pause Squat 3 x 4 @ RPE 6" },
  { cell: "Day 3 · B1", before: "Overhead Press 3 x 8 @ RPE 7", after: "Landmine Press 3 x 8 @ RPE 7" },
];

export const pendingProps: ProgramDiffCardProps = {
  week: 3,
  rows: AROHA_ROWS,
  reason: "Aroha's left shoulder is feeling sore after heavy pressing. Dropping squat volume slightly to manage fatigue.",
  status: "pending",
};

export const approvedProps: ProgramDiffCardProps = {
  week: 3,
  rows: AROHA_ROWS,
  reason: "Aroha's left shoulder is feeling sore after heavy pressing. Dropping squat volume slightly to manage fatigue.",
  status: "approved",
  appliedAt: "9:02 pm",
};

export const rejectedProps: ProgramDiffCardProps = {
  week: 3,
  rows: AROHA_ROWS,
  reason: "Aroha's left shoulder is feeling sore after heavy pressing. Dropping squat volume slightly to manage fatigue.",
  status: "rejected",
};

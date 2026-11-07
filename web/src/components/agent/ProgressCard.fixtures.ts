import type { ProgressCardProps } from "./ProgressCard";

export const stalledSquat: ProgressCardProps = {
  lift: "Back squat",
  points: [
    { week: 1, kg: 85 },
    { week: 2, kg: 88 },
    { week: 3, kg: 90 },
    { week: 4, kg: 92.5 },
    { week: 5, kg: 95 },
    { week: 6, kg: 95 },
    { week: 7, kg: 95 },
    { week: 8, kg: 95 },
  ],
  topSet: "95 kg × 3",
  est1rm: 103,
  goal: 120,
  trend: { tone: "flag", label: "Stalled 4 wks" },
};

export const risingBench: ProgressCardProps = {
  lift: "Bench press",
  points: [
    { week: 1, kg: 60 },
    { week: 2, kg: 62.5 },
    { week: 3, kg: 62.5 },
    { week: 4, kg: 65 },
    { week: 5, kg: 65 },
    { week: 6, kg: 67.5 },
    { week: 7, kg: 67.5 },
    { week: 8, kg: 70 },
  ],
  topSet: "70 kg × 5",
  est1rm: 80,
  goal: 85,
  trend: { tone: "ok", label: "Up 10 kg" },
};

export const noGoalBench: ProgressCardProps = {
  ...risingBench,
  goal: undefined,
};

import { cx, Card, Badge } from "../ui";
import type { BadgeTone } from "../ui";

export interface ProgressCardProps {
  /** Lift name, e.g. "Back squat". */
  lift: string;
  /** Weekly data points. */
  points: { week: number; kg: number }[];
  /** Formatted top set, e.g. "95 kg × 3". */
  topSet: string;
  /** Estimated 1-rep max. */
  est1rm: number;
  /** Target weight, if set. */
  goal?: number;
  /** Trend assessment. */
  trend: { tone: "ok" | "flag"; label: string };
  className?: string;
}

/* ---------- helpers ---------- */

/** Find the index where the trailing flat segment begins. */
function tailStart(points: { kg: number }[]): number {
  if (points.length < 2) return points.length;
  const last = points[points.length - 1].kg;
  let i = points.length - 2;
  while (i >= 0 && points[i].kg === last) i--;
  return i + 1;
}

function buildPath(
  pts: { week: number; kg: number }[],
  xS: (w: number) => number,
  yS: (k: number) => number,
): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${xS(p.week).toFixed(1)} ${yS(p.kg).toFixed(1)}`)
    .join(" ");
}

/* ---------- component ---------- */

export function ProgressCard({
  lift,
  points,
  topSet,
  est1rm,
  goal,
  trend,
  className,
}: ProgressCardProps) {
  if (points.length === 0) return null;

  /* Chart layout */
  const PAD = { left: 40, right: 15, top: 10, bottom: 25 };
  const W = 320;
  const H = 130;
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const weeks = points.map((p) => p.week);
  const kgs = points.map((p) => p.kg);
  const minWeek = Math.min(...weeks);
  const maxWeek = Math.max(...weeks);
  const minKg = Math.min(...kgs);
  const maxKg = Math.max(...kgs);
  const kgRange = maxKg - minKg || 1;
  const kgPad = kgRange * 0.1 || 5;

  const xS = (week: number) => PAD.left + ((week - minWeek) / (maxWeek - minWeek)) * chartW;
  const yS = (kg: number) =>
    PAD.top + chartH - ((kg - (minKg - kgPad)) / (kgRange + 2 * kgPad)) * chartH;

  const latestKg = kgs[kgs.length - 1];
  const latestY = yS(latestKg);

  const tStart = tailStart(points);
  const hasTail = trend.tone === "flag" && tStart < points.length - 1;

  const fullPath = buildPath(points, xS, yS);
  const tailPath = hasTail ? buildPath(points.slice(tStart), xS, yS) : "";

  /* X labels: first, middle, last week */
  const midWeek = points[Math.floor(points.length / 2)].week;

  /* Aria label */
  const ariaLabel = `${lift} progress: started at ${kgs[0]} kg, current ${latestKg} kg. ${trend.label}.`;

  const badgeTone: BadgeTone = trend.tone === "flag" ? "flag" : "ok";

  return (
    <Card className={cx("w-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-base uppercase tracking-wide">
          {lift}
          <span className="text-ink-muted font-normal"> · {topSet}</span>
        </h3>
        <Badge tone={badgeTone}>
          <span
            className="inline-block rounded-full"
            style={{ width: 6, height: 6, backgroundColor: `var(--${trend.tone})` }}
          />
          {trend.label}
        </Badge>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={ariaLabel}
      >
        <style>{`
          .pc-ln { stroke: var(--ink); stroke-width: 2; fill: none; stroke-linejoin: round; stroke-linecap: round; }
          .pc-dt { fill: var(--ink); }
          .pc-ln-t { stroke: var(--flag); stroke-width: 2; fill: none; stroke-linejoin: round; stroke-linecap: round; }
          .pc-dt-t { fill: var(--flag); }
          .pc-gl { stroke: var(--ink-muted); stroke-width: 1; stroke-dasharray: 4 3; }
          .pc-gl-lbl { fill: var(--ink-muted); font-size: 10px; font-family: var(--font-body); }
          .pc-xlbl { fill: var(--ink-muted); font-size: 10px; font-family: var(--font-body); text-anchor: middle; }
          @media (prefers-color-scheme: dark) {
            .pc-ln { stroke: var(--ok); }
            .pc-dt { fill: var(--ok); }
          }
        `}</style>

        {/* Dashed gridline at latest value */}
        <line x1={PAD.left} y1={latestY} x2={xS(maxWeek)} y2={latestY} className="pc-gl" />
        <text x={xS(maxWeek) + 4} y={latestY + 3.5} className="pc-gl-lbl">
          {latestKg} kg
        </text>

        {/* Full line (main colour) */}
        <path d={fullPath} className="pc-ln" />

        {/* Flat tail overlay (flag) */}
        {hasTail && <path d={tailPath} className="pc-ln-t" />}

        {/* Dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xS(p.week)}
            cy={yS(p.kg)}
            r={3}
            className={i >= tStart ? "pc-dt-t" : "pc-dt"}
          />
        ))}

        {/* X-axis labels */}
        <text x={xS(minWeek)} y={H - 4} className="pc-xlbl">
          W{minWeek}
        </text>
        <text x={xS(midWeek)} y={H - 4} className="pc-xlbl">
          W{midWeek}
        </text>
        <text x={xS(maxWeek)} y={H - 4} className="pc-xlbl">
          W{maxWeek}
        </text>
      </svg>

      {/* Footer stats */}
      <div className="grid grid-cols-3 border-t border-border pt-3 mt-3">
        <div>
          <div className="text-xs text-ink-muted">Top set</div>
          <div className="text-sm font-medium tabular">{topSet}</div>
        </div>
        <div>
          <div className="text-xs text-ink-muted">Est. 1RM</div>
          <div className="text-sm font-medium tabular">{est1rm} kg</div>
        </div>
        <div>
          <div className="text-xs text-ink-muted">Goal</div>
          <div className="text-sm font-medium tabular">{goal ? `${goal} kg` : "—"}</div>
        </div>
      </div>
    </Card>
  );
}

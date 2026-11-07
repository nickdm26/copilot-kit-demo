import { TEST_IDS, VOLUME_RANGE } from "../../lib/contracts";
import { Badge, Card, cx } from "../ui";
import type { MuscleVolume } from "./weekVolume";

export interface WeekSummaryProps {
  week: number | undefined;
  note?: string;
  rows: MuscleVolume[];
  state: "streaming" | "done";
}

const BAR_MAX = VOLUME_RANGE.max * 1.25;
const fill = { low: "bg-accent", ok: "bg-ok", high: "bg-flag" } as const;

export function WeekSummary({ week, note, rows, state }: WeekSummaryProps) {
  return (
    <Card data-testid={TEST_IDS.weekSummary} data-week={week ?? ""} data-state={state} className="my-2 flex flex-col gap-2">
      <h3 className="font-heading text-xl uppercase tracking-wide">
        {week === undefined ? "Week summary" : `Week ${week} volume`}
      </h3>
      {state === "streaming" && week === undefined ? (
        <div className="h-3 w-2/3 rounded-sm bg-border animate-pulse" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No sets in this week yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.muscle} data-muscle={r.muscle} data-verdict={r.verdict} className="flex items-center gap-2 text-xs">
              <span className="w-20 capitalize text-ink-muted">{r.muscle}</span>
              <div className="flex-1 h-2 rounded-sm bg-bg border border-border overflow-hidden">
                <div className={cx("h-full", fill[r.verdict])} style={{ width: `${Math.min(100, (r.sets / BAR_MAX) * 100)}%` }} />
              </div>
              <span className="tabular w-8 text-right">{r.sets}</span>
              <span className="w-20">
                {r.verdict === "low" ? <Badge tone="accent">too little</Badge> : null}
                {r.verdict === "high" ? <Badge tone="flag">too much</Badge> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-muted">
        Target {VOLUME_RANGE.min}-{VOLUME_RANGE.max} sets per muscle per week.
      </p>
      {note ? <p className="text-sm">{note}</p> : null}
    </Card>
  );
}

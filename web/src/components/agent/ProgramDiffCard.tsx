import { TEST_IDS } from "../../lib/contracts";
import { Badge, Button, Card, Chip, cx } from "../ui";

export interface DiffRow {
  cell: string;
  before: string;
  after: string;
}

export interface ProgramDiffCardProps {
  week: number;
  rows: DiffRow[];
  reason?: string;
  status: "pending" | "approved" | "rejected";
  appliedAt?: string;
  onApproveAll?: () => void;
  onReviewOneByOne?: () => void;
  onReject?: () => void;
  onUndo?: () => void;
  onSuggest?: (text: string) => void;
}

const chips = ["Keep front squats", "Smaller change"];

export function ProgramDiffCard({
  week,
  rows,
  reason,
  status,
  appliedAt,
  onApproveAll,
  onReviewOneByOne,
  onReject,
  onUndo,
  onSuggest,
}: ProgramDiffCardProps) {
  return (
    <Card
      className={cx(
        "my-2 flex flex-col gap-3",
        status === "pending" && "border-accent",
      )}
      data-testid={TEST_IDS.programDiffCard}
      data-state={status}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="font-heading text-xl uppercase tracking-wide mr-auto">
          Week {week}
        </h3>
        {status === "pending" && (
          <Badge tone="accent">{rows.length} changes</Badge>
        )}
        {status === "approved" && (
          <Badge tone="ok">Approved</Badge>
        )}
        {status === "rejected" && (
          <Badge tone="neutral">Rejected</Badge>
        )}
      </div>

      {/* Reason */}
      {reason && status === "pending" && (
        <p className="text-sm text-ink-muted">{reason}</p>
      )}

      {/* Diff rows */}
      <div className="flex flex-col gap-1">
        {status === "approved"
          ? /* Approved: show only after values */
            rows.map((r, i) => (
              <div
                key={i}
                className="flex flex-col gap-0.5 text-sm"
              >
                <span className="text-xs text-ink-muted">{r.cell}</span>
                <span className="tabular font-medium">{r.after}</span>
              </div>
            ))
          : /* Pending / rejected: show full diff */
            rows.map((r, i) => (
              <div
                key={i}
                className={cx(
                  "grid gap-x-3 gap-y-0.5 px-3 py-2 rounded-sm text-sm",
                  /* Desktop: 3 columns. Mobile: single column. */
                  "grid-cols-[auto_1fr_1fr] max-sm:grid-cols-1",
                  status === "rejected" && "border border-dashed border-border",
                  status === "pending" && "bg-accent-tint/30",
                )}
              >
                {/* Cell label — full width on mobile, first col on desktop */}
                <span className="text-xs text-ink-muted font-medium max-sm:col-span-1">
                  {r.cell}
                </span>

                {/* Before — struck-through on mobile; muted on both pending and rejected */}
                <span
                  className={cx(
                    "tabular text-ink-muted max-sm:line-through max-sm:before:content-['←_']",
                  )}
                >
                  {r.before}
                </span>

                {/* After — highlighted on pending, struck-through on rejected, bold on mobile */}
                <span
                  className={cx(
                    "tabular max-sm:font-bold font-medium",
                    status === "pending" && "bg-accent-tint/40 rounded-sm px-1 -mx-1",
                    status === "rejected" && "line-through",
                  )}
                >
                  {r.after}
                </span>
              </div>
            ))}
      </div>

      {/* Rejected: empty-state message + chips */}
      {status === "rejected" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted">
            Nothing changed. Tell the agent what to try instead.
          </p>
          <div className="flex flex-wrap gap-2">
            {chips.map((label) => (
              <Chip
                key={label}
                onClick={() => onSuggest?.(label)}
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Approved: footer */}
      {status === "approved" && appliedAt && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <span>Applied to the program at {appliedAt}</span>
          {onUndo && (
            <Button variant="ghost" size="sm" onClick={onUndo}>
              Undo
            </Button>
          )}
        </div>
      )}

      {/* Pending: action buttons */}
      {status === "pending" && (
        <div className="flex flex-wrap gap-2 max-sm:flex-col">
          <Button size="sm" onClick={onApproveAll} className="max-sm:w-full">
            Approve all
          </Button>
          <div className="flex gap-2 max-sm:w-full max-sm:flex-col">
            <Button
              size="sm"
              variant="secondary"
              onClick={onReviewOneByOne}
              className="max-sm:w-full"
            >
              Review one by one
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onReject}
              className="max-sm:w-full border-flag text-flag hover:bg-flag-tint"
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

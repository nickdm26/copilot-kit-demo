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
  /** Optional: the button only shows when this is set. */
  onReviewOneByOne?: () => void;
  onReject?: () => void;
  onUndo?: () => void;
  onSuggest?: (text: string) => void;
}

const chips = ["Keep front squats", "Smaller change"];

/** Cell label column, then before and after. Below ~384px of card width each row stacks. */
const rowGrid = "grid gap-x-2 gap-y-0.5 grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)] @max-sm:grid-cols-1";
const twoColGrid = "grid gap-x-2 gap-y-0.5 grid-cols-[76px_minmax(0,1fr)] @max-sm:grid-cols-1";

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
      className={cx("@container my-2 flex flex-col gap-3", status === "pending" && "border-accent!")}
      data-testid={TEST_IDS.programDiffCard}
      data-state={status}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3
          className={cx(
            "font-heading text-lg uppercase tracking-wide leading-tight",
            status === "rejected" && "text-ink-muted",
          )}
        >
          Program changes · Wk {week}
        </h3>
        {status === "pending" && (
          <Badge tone="accent" className="tabular shrink-0">
            {rows.length} {rows.length === 1 ? "change" : "changes"}
          </Badge>
        )}
        {status === "approved" && (
          <Badge tone="ok" className="shrink-0">
            Approved
          </Badge>
        )}
        {status === "rejected" && (
          <Badge tone="neutral" className="shrink-0">
            Rejected
          </Badge>
        )}
      </div>

      {/* Rows */}
      <div className="tabular flex flex-col gap-1.5 text-[13px]">
        {status === "pending" && (
          <div className={cx(rowGrid, "px-2 text-xs text-ink-muted @max-sm:hidden")} aria-hidden="true">
            <span>Cell</span>
            <span>Before</span>
            <span>After</span>
          </div>
        )}
        {rows.map((r, i) =>
          status === "pending" ? (
            <div key={i} className={cx(rowGrid, "rounded-sm bg-bg p-2")}>
              <span className="text-ink-muted">{r.cell}</span>
              <span className="text-ink-muted @max-sm:line-through">
                <span className="sr-only">Before: </span>
                {r.before}
              </span>
              <span className="self-start rounded-[4px] bg-accent-tint px-1 font-semibold @max-sm:justify-self-start">
                <span className="sr-only">After: </span>
                {r.after}
              </span>
            </div>
          ) : status === "approved" ? (
            <div key={i} className={cx(twoColGrid, "rounded-sm bg-bg p-2")}>
              <span className="text-ink-muted">{r.cell}</span>
              <span className="font-medium">{r.after}</span>
            </div>
          ) : (
            <div key={i} className={cx(twoColGrid, "rounded-sm border border-dashed border-border p-2")}>
              <span className="text-ink-muted">{r.cell}</span>
              <span className="text-ink-muted line-through">{r.after}</span>
            </div>
          ),
        )}
      </div>

      {/* Pending: reason and actions */}
      {status === "pending" && (
        <>
          {reason && <p className="text-[13px] text-ink-muted">{reason}</p>}
          <div className="flex flex-wrap gap-2 @max-sm:grid @max-sm:grid-cols-2">
            <Button onClick={onApproveAll} className="@max-sm:col-span-2 @max-sm:h-11">
              Approve all
            </Button>
            {onReviewOneByOne && (
              <Button variant="secondary" onClick={onReviewOneByOne} className="@max-sm:h-11">
                Review one by one
              </Button>
            )}
            <Button
              variant="danger"
              onClick={onReject}
              className={cx("@max-sm:h-11", !onReviewOneByOne && "@max-sm:col-span-2")}
            >
              Reject
            </Button>
          </div>
        </>
      )}

      {/* Approved: when it was applied, and undo */}
      {status === "approved" && (appliedAt || onUndo) && (
        <div className="flex items-center justify-between gap-2">
          <span className="tabular text-xs text-ink-muted">
            {appliedAt ? `Applied to the program at ${appliedAt}` : "Applied to the program"}
          </span>
          {onUndo && (
            <Button variant="ghost" size="sm" onClick={onUndo} className="underline">
              Undo
            </Button>
          )}
        </div>
      )}

      {/* Rejected: what next */}
      {status === "rejected" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-muted">Nothing changed. Tell the agent what to try instead.</p>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((label) => (
              <Chip key={label} onClick={() => onSuggest?.(label)}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

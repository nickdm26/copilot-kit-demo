import { TEST_IDS, type ProposeSwapArgs } from "../../lib/contracts";
import { Badge, Button, Card, cx } from "../ui";
import { findExercise } from "./exercises";

export type SwapState = "streaming" | "pending" | "approved" | "rejected";

export interface SwapApprovalProps {
  args: Partial<ProposeSwapArgs>;
  state: SwapState;
  onAnswer?: (approved: boolean) => void;
}

const nameOf = (id?: string) => (id ? (findExercise(id)?.name ?? id) : "...");

export function SwapApproval({ args, state, onAnswer }: SwapApprovalProps) {
  const where = [args.week !== undefined ? `Week ${args.week}` : null, args.day ?? null].filter(Boolean).join(" ");
  return (
    <Card
      data-testid={TEST_IDS.swapApproval}
      data-state={state}
      className={cx("my-2 flex flex-col gap-2", state === "pending" && "border-accent!")}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-heading text-lg uppercase tracking-wide mr-auto">Swap proposal</h3>
        {state === "pending" ? <Badge tone="accent">Needs approval</Badge> : null}
        {state === "approved" ? <Badge tone="ok">Approved</Badge> : null}
        {state === "rejected" ? <Badge tone="neutral">Rejected</Badge> : null}
      </div>
      <p className="text-sm font-medium">
        <span>{nameOf(args.fromExerciseId)}</span> <span className="text-ink-muted">to</span>{" "}
        <span>{nameOf(args.toExerciseId)}</span>
        <span className="text-ink-muted font-normal"> · {where || "every occurrence"}</span>
      </p>
      {args.reason ? (
        <p className="text-sm text-ink-muted">{args.reason}</p>
      ) : state === "streaming" ? (
        <div className="h-3 w-2/3 rounded-sm bg-border animate-pulse" />
      ) : null}
      {state === "pending" || state === "streaming" ? (
        <div className="flex gap-2">
          <Button data-testid={TEST_IDS.swapApprove} disabled={state !== "pending"} onClick={() => onAnswer?.(true)}>
            Approve
          </Button>
          <Button
            data-testid={TEST_IDS.swapReject}
            variant="danger"
            disabled={state !== "pending"}
            onClick={() => onAnswer?.(false)}
          >
            Reject
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

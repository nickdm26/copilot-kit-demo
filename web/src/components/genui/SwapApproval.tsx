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
      className={cx(
        "my-2 flex flex-col gap-2",
        state === "approved" && "border-ok bg-ok-tint",
        state === "rejected" && "border-flag bg-flag-tint",
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-heading text-xl uppercase tracking-wide mr-auto">Swap proposal</h3>
        {state === "approved" ? <Badge tone="ok">Approved</Badge> : null}
        {state === "rejected" ? <Badge tone="flag">Rejected</Badge> : null}
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
      <div className="flex gap-2">
        <Button
          data-testid={TEST_IDS.swapApprove}
          size="sm"
          disabled={state !== "pending"}
          onClick={() => onAnswer?.(true)}
          className="bg-ok border-ok text-on-fill hover:bg-ok hover:border-ok"
        >
          Approve
        </Button>
        <Button
          data-testid={TEST_IDS.swapReject}
          size="sm"
          variant="danger"
          disabled={state !== "pending"}
          onClick={() => onAnswer?.(false)}
        >
          Reject
        </Button>
      </div>
    </Card>
  );
}

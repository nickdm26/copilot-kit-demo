import { TEST_IDS } from "../../lib/contracts";
import { useSession } from "../../lib/session";
import { cx } from "../ui";

/**
 * The "Sub-agents" switch. On: the coach builds new days and weeks with parallel sub-agents (runSubagents).
 * It only changes what the next run asks for, so flipping it keeps the thread.
 */
export function SubagentsToggle({ className }: { className?: string }) {
  const { subagents, setSubagents } = useSession();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={subagents}
      data-testid={TEST_IDS.subagentsToggle}
      onClick={() => setSubagents(!subagents)}
      title={subagents ? "The coach fans new days and weeks out to parallel sub-agents" : "Let the coach use parallel sub-agents"}
      className={cx(
        "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        subagents ? "border-accent bg-accent-tint text-ink" : "border-border bg-surface text-ink-muted hover:bg-bg",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
          subagents ? "bg-accent" : "bg-border",
        )}
      >
        <span
          className={cx(
            "absolute h-3 w-3 rounded-full bg-surface transition-transform",
            subagents ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
      Sub-agents
    </button>
  );
}

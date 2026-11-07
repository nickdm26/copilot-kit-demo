import { cx } from "../ui";

export interface PendingChangesBannerProps {
  /** Number of pending proposed changes from the coach agent. */
  count: number;
  /** Called when the user taps the banner to review. */
  onReview: () => void;
  className?: string;
}

/**
 * Accent-bordered banner showing that the coach agent has proposed changes.
 * The entire banner is one clickable button.
 */
export function PendingChangesBanner({ count, onReview, className }: PendingChangesBannerProps) {
  return (
    <button
      type="button"
      onClick={onReview}
      className={cx(
        "flex w-full items-center gap-3 rounded-md border border-accent bg-accent-tint p-3 text-left cursor-pointer transition-colors",
        "hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      {/* Accent dot */}
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
        aria-hidden="true"
      />

      <div className="flex-1 min-w-0">
        <p className="font-body text-sm font-semibold text-ink">
          Coach agent proposed {count} {count === 1 ? "change" : "changes"}
        </p>
        <p className="text-xs text-ink-muted">Tap to review before they apply</p>
      </div>

      {/* Chevron */}
      <svg
        className="h-4 w-4 shrink-0 text-ink-muted"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 4l4 4-4 4" />
      </svg>
    </button>
  );
}

import { cx } from "../ui/cx";

export interface ChatEmptyStateProps {
  clientName: string;
  suggestions: string[];
  onPick: (label: string) => void;
}

/**
 * Empty-state placeholder for the chat pane.
 * Shows a centred heading and starter suggestions as large vertical buttons.
 */
export function ChatEmptyState({ clientName, suggestions, onPick }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
      <h2 className="font-heading text-xl uppercase tracking-wide text-ink mb-4">
        Ask about {clientName}&rsquo;s program
      </h2>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {suggestions.map((s, i) => (
            <button
              key={`${s}-${i}`}
              type="button"
              onClick={() => onPick(s)}
              className={cx(
                "inline-flex min-h-11 items-center justify-center rounded-md border px-4 py-2",
                "bg-surface text-ink border-border",
                "text-sm font-medium cursor-pointer transition-colors",
                "hover:bg-accent-tint hover:border-accent",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

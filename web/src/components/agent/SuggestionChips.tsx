import type { ButtonHTMLAttributes } from "react";
import { cx } from "../ui/cx";

export interface SuggestionChipItem {
  label: string;
  highlighted?: boolean;
}

export interface SuggestionChipsProps {
  suggestions: SuggestionChipItem[];
  onPick: (label: string) => void;
}

/**
 * One row of suggestion chips above the chat input.
 * Overflows sideways on narrow viewports with no visible scrollbar.
 * Highlighted chips get accent border and accent tint.
 */
export function SuggestionChips({ suggestions, onPick }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      role="list"
      className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex gap-2 px-4 py-2 w-max min-w-full">
        {suggestions.map((s, i) => (
          <SuggestionChipButton
            key={`${s.label}-${i}`}
            highlighted={s.highlighted}
            onClick={() => onPick(s.label)}
          >
            {s.label}
          </SuggestionChipButton>
        ))}
      </div>
    </div>
  );
}

/* ── Single chip button ─────────────────────────────────────── */

interface SuggestionChipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  highlighted?: boolean;
}

function SuggestionChipButton({
  highlighted = false,
  type = "button",
  className,
  ...rest
}: SuggestionChipButtonProps) {
  return (
    <button
      type={type}
      role="listitem"
      className={cx(
        "inline-flex items-center justify-center rounded-full border px-3",
        "h-8 md:h-9",
        "text-xs font-medium whitespace-nowrap cursor-pointer transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        highlighted
          ? "bg-accent-tint text-ink border-accent"
          : "bg-surface text-ink-muted border-border hover:text-ink",
        className,
      )}
      {...rest}
    />
  );
}

import type { ButtonHTMLAttributes } from "react";
import { cx } from "../ui/cx";

export interface SuggestionChipItem {
  label: string;
  highlighted?: boolean;
}

export interface SuggestionChipsProps {
  suggestions: SuggestionChipItem[];
  onPick: (label: string) => void;
  className?: string;
}

/**
 * Suggestion chips above the chat input.
 * Desktop: they wrap. Phone: one row that scrolls sideways with no visible scrollbar.
 * Highlighted chips get accent border and accent tint.
 */
export function SuggestionChips({ suggestions, onPick, className }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      role="list"
      aria-label="Suggestions"
      className={cx(
        "-mx-3.5 overflow-x-auto px-3.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "md:mx-0 md:overflow-visible md:px-0",
        className,
      )}
    >
      <div className="flex w-max gap-1.5 md:w-auto md:flex-wrap">
        {suggestions.map((s, i) => (
          <SuggestionChipButton key={`${s.label}-${i}`} highlighted={s.highlighted} onClick={() => onPick(s.label)}>
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

function SuggestionChipButton({ highlighted = false, type = "button", className, ...rest }: SuggestionChipButtonProps) {
  return (
    <span role="listitem" className="shrink-0">
      <button
        type={type}
        className={cx(
          "inline-flex items-center justify-center rounded-full border px-3",
          "h-9 md:h-8",
          "text-[13px] text-ink whitespace-nowrap cursor-pointer transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          highlighted ? "bg-accent-tint border-accent" : "bg-surface border-border hover:bg-bg",
          className,
        )}
        {...rest}
      />
    </span>
  );
}

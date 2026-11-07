import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected / active state (sets aria-pressed). */
  selected?: boolean;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, type = "button", className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-3 h-8 text-[13px] cursor-pointer transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:opacity-45 disabled:cursor-not-allowed",
        selected
          ? "bg-accent-tint text-ink border-accent"
          : "bg-surface text-ink-muted border-border hover:text-ink",
        className,
      )}
      {...rest}
    />
  );
});

import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "accent" | "flag" | "ok";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const tones: Record<BadgeTone, string> = {
  neutral: "bg-bg text-ink-muted border-border",
  accent: "bg-accent-tint text-ink border-accent",
  flag: "bg-flag-tint text-ink border-flag",
  ok: "bg-ok-tint text-ink border-ok",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = "neutral", className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium leading-4",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
});

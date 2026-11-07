import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "accent" | "flag" | "ok";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Show the 6px coloured dot before the text. Turn it off when the badge has its own icon. */
  dot?: boolean;
}

/** A tint of the tone with ink text; the colour itself only shows in the dot. Neutral gets a border instead. */
const tones: Record<BadgeTone, string> = {
  neutral: "bg-bg border border-border",
  accent: "bg-accent-tint",
  flag: "bg-flag-tint",
  ok: "bg-ok-tint",
};

const dots: Record<BadgeTone, string> = {
  neutral: "bg-ink-muted",
  accent: "bg-accent",
  flag: "bg-flag",
  ok: "bg-ok",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = "neutral", dot = true, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx(
        "inline-flex min-h-[22px] items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium leading-4 text-ink",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span aria-hidden="true" className={cx("h-1.5 w-1.5 shrink-0 rounded-full", dots[tone])} /> : null}
      {children}
    </span>
  );
});

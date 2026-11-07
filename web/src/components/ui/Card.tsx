import { forwardRef, type HTMLAttributes } from "react";
import { cx } from "./cx";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Remove the default padding. */
  flush?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { flush = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx("bg-surface text-ink border border-border rounded-md", !flush && "p-4", className)}
      {...rest}
    />
  );
});

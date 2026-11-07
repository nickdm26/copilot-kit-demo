import { forwardRef, type SelectHTMLAttributes } from "react";
import { cx } from "./cx";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Native select, styled. Forwards ref and all props (e.g. data-testid). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(
        "h-10 rounded-md border border-border bg-surface px-3 text-sm text-ink font-body cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:opacity-45 disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

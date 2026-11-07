import { cx } from "../ui/cx";

export interface SystemMessageProps {
  text: string;
}

/** Centred, 12px, muted status text — no bubble, no background. */
export function SystemMessage({ text }: SystemMessageProps) {
  return <p className={cx("text-center text-xs text-ink-muted")}>{text}</p>;
}

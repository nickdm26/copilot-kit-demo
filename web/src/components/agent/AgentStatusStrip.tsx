import { type JSX } from "react";
import { Button, cx } from "../ui";

export type StepState = "done" | "active" | "pending";

export interface AgentStatusStripProps {
  status: "idle" | "working" | "awaiting-approval" | "done" | "error";
  steps?: { label: string; state: StepState }[];
  summary?: string;
  errorMessage?: string;
  /** Idle text. Default "Ready." */
  idleText?: string;
  /** Done: the step list is open (the button then reads "Hide steps"). */
  stepsOpen?: boolean;
  onShowSteps?: () => void;
  onRetry?: () => void;
  onSwitchModel?: () => void;
}

/* ---- Inline SVG icons ---- */

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cx("animate-spin", className)}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <path
        d="M18 10a8 8 0 01-8 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <rect x="5" y="3" width="3" height="14" rx="1" />
      <rect x="12" y="3" width="3" height="14" rx="1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
      />
    </svg>
  );
}

function DotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="4" r="3" />
    </svg>
  );
}

function OutlinedDotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="2.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/* ---- Helpers ---- */

function activeStepLabel(steps?: { label: string; state: StepState }[]): string | null {
  if (!steps) return null;
  const active = steps.find((s) => s.state === "active");
  return active?.label ?? null;
}

function activeStepIndex(steps?: { label: string; state: StepState }[]): number {
  if (!steps) return -1;
  return steps.findIndex((s) => s.state === "active");
}

/* ---- Step list ---- */

function StepList({ steps, className }: { steps: { label: string; state: StepState }[]; className?: string }) {
  return (
    <ol className={cx("mt-1.5 flex flex-col gap-0.5 text-ink-muted", className)}>
      {steps.map((step, i) => (
        <li key={i} className={cx("flex items-center gap-2", step.state === "active" && "font-medium text-ink")}>
          <span className="flex w-3.5 shrink-0 justify-center" aria-hidden="true">
            {step.state === "done" && <CheckIcon className="h-3.5 w-3.5 text-ok" />}
            {step.state === "active" && <DotIcon className="h-2 w-2 text-accent" />}
            {step.state === "pending" && <OutlinedDotIcon className="h-2 w-2 text-ink-muted" />}
          </span>
          <span className="truncate">{step.label}</span>
          <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "active" ? " (in progress)" : ""}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---- Component ---- */

export function AgentStatusStrip({
  status,
  steps,
  summary,
  errorMessage,
  idleText = "Ready.",
  stepsOpen = false,
  onShowSteps,
  onRetry,
  onSwitchModel,
}: AgentStatusStripProps): JSX.Element {
  const totalSteps = steps?.length ?? 0;
  const current = activeStepIndex(steps);
  const label = activeStepLabel(steps);

  /* --- idle --- */
  if (status === "idle") {
    return (
      <div
        role="status"
        className="flex items-center gap-2 px-4 py-2 text-[13px] text-ink-muted"
      >
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full border border-ink-muted bg-border" />
        <span className="truncate">{idleText}</span>
      </div>
    );
  }

  /* --- working --- */
  if (status === "working") {
    return (
      <div
        role="status"
        className="bg-accent-tint/50 px-4 py-2.5 text-[13px]"
      >
        {/* Top row: spinner + label + step counter */}
        <div className="flex items-center gap-2">
          <SpinnerIcon className="h-4 w-4 text-accent shrink-0" />
          <span className="font-semibold text-ink truncate">
            {label ?? "Working…"}
          </span>
          {current >= 0 && (
            <span className="ml-auto text-ink-muted tabular shrink-0">
              {/* Without pending steps the total isn't known yet. */}
              {steps?.some((st) => st.state === "pending") ? `Step ${current + 1} of ${totalSteps}` : `Step ${current + 1}`}
            </span>
          )}
        </div>

        {/* Step list */}
        {steps && steps.length > 0 && <StepList steps={steps} />}
      </div>
    );
  }

  /* --- awaiting-approval --- */
  if (status === "awaiting-approval") {
    return (
      <div
        role="status"
        className="bg-accent-tint/50 flex items-center gap-2 px-4 py-2.5 text-[13px]"
      >
        <PauseIcon className="h-4 w-4 text-ink shrink-0" />
        <span className="font-medium text-ink">Waiting for your approval</span>
      </div>
    );
  }

  /* --- done --- */
  if (status === "done") {
    return (
      <div role="status" className="bg-ok-tint/60 px-4 py-1.5 text-[13px]">
        <div className="flex min-h-8 items-center gap-2">
          <CheckIcon className="h-4 w-4 text-ok shrink-0" />
          <span className="font-medium text-ink">Done</span>
          {summary && <span className="tabular truncate text-ink-muted">{summary}</span>}
          {onShowSteps && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowSteps}
              aria-expanded={stepsOpen}
              className="ml-auto -mr-2 shrink-0 underline"
            >
              {stepsOpen ? "Hide steps" : "Show steps"}
            </Button>
          )}
        </div>
        {stepsOpen && steps && steps.length > 0 && <StepList steps={steps} className="mb-1.5" />}
      </div>
    );
  }

  /* --- error --- */
  return (
    <div
      role="alert"
      className="bg-flag-tint/60 px-4 py-2.5 text-[13px]"
    >
      <div className="flex items-center gap-2">
        <XIcon className="h-4 w-4 text-flag shrink-0" />
        <span className="font-semibold text-ink">Couldn&rsquo;t reach the model</span>
      </div>
      {errorMessage && (
        <p className="mt-1 ml-6 text-ink-muted">{errorMessage}</p>
      )}
      <div className="mt-2 ml-6 flex items-center gap-2">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
        {onSwitchModel && (
          <Button variant="ghost" size="sm" onClick={onSwitchModel}>
            Switch model
          </Button>
        )}
      </div>
    </div>
  );
}

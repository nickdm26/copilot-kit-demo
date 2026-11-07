import { type JSX } from "react";
import { Button, cx } from "../ui";

export type StepState = "done" | "active" | "pending";

export interface AgentStatusStripProps {
  status: "idle" | "working" | "awaiting-approval" | "done" | "error";
  steps?: { label: string; state: StepState }[];
  summary?: string;
  errorMessage?: string;
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

/* ---- Component ---- */

export function AgentStatusStrip({
  status,
  steps,
  summary,
  errorMessage,
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
        className="flex items-center gap-2 px-4 py-2 text-sm text-ink-muted"
      >
        <DotIcon className="h-2 w-2 text-ink-muted" />
        <span>Ready.</span>
      </div>
    );
  }

  /* --- working --- */
  if (status === "working") {
    return (
      <div
        role="status"
        className="bg-accent-tint px-4 py-3"
      >
        {/* Top row: spinner + label + step counter */}
        <div className="flex items-center gap-2">
          <SpinnerIcon className="h-4 w-4 text-accent shrink-0" />
          <span className="font-medium text-sm text-ink truncate">
            {label ?? "Working…"}
          </span>
          {totalSteps > 0 && (
            <span className="ml-auto text-xs text-ink-muted tabular shrink-0">
              Step {current + 1} of {totalSteps}
            </span>
          )}
        </div>

        {/* Step list */}
        {steps && steps.length > 0 && (
          <ul className="mt-2 space-y-1">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center gap-2 text-xs">
                {step.state === "done" && (
                  <CheckIcon className="h-3 w-3 text-ok shrink-0" />
                )}
                {step.state === "active" && (
                  <DotIcon className="h-2 w-2 text-accent shrink-0" />
                )}
                {step.state === "pending" && (
                  <OutlinedDotIcon className="h-2 w-2 text-ink-muted shrink-0" />
                )}
                <span
                  className={cx(
                    step.state === "active" && "font-semibold text-ink",
                    step.state === "done" && "text-ink-muted",
                    step.state === "pending" && "text-ink-muted",
                  )}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  /* --- awaiting-approval --- */
  if (status === "awaiting-approval") {
    return (
      <div
        role="status"
        className="bg-accent-tint flex items-center gap-2 px-4 py-3 text-sm"
      >
        <PauseIcon className="h-4 w-4 text-accent shrink-0" />
        <span className="text-ink">Waiting for your approval</span>
      </div>
    );
  }

  /* --- done --- */
  if (status === "done") {
    return (
      <div
        role="status"
        className="bg-ok-tint flex items-center gap-2 px-4 py-3 text-sm"
      >
        <CheckIcon className="h-4 w-4 text-ok shrink-0" />
        <span className="font-medium text-ink">Done</span>
        {summary && <span className="text-ink-muted">{summary}</span>}
        {onShowSteps && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowSteps}
            className="ml-auto"
          >
            Show steps
          </Button>
        )}
      </div>
    );
  }

  /* --- error --- */
  return (
    <div
      role="alert"
      className="bg-flag-tint px-4 py-3 text-sm"
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

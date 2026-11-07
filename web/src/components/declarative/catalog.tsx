// The component catalog for declarative how-tos. The agent can only pick these parts and fill in
// their props; it never sends markup, styles or code. All text is rendered as React text.
// Colours come from theme tokens only (Tailwind utilities), so the parts work inside the chat too.

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button, cx } from "../ui";
import { PoseFigure, poseLabel } from "./PoseFigure";
import type { CalloutTone, HowToStep, View } from "./schema";

export { PoseFigure, poseLabel } from "./PoseFigure";

/* ---------- Step context: lets a TempoStrip follow the Stepper in the same tree ---------- */

interface StepState {
  step: number;
  setStep: (step: number) => void;
  /** Each step's tempoBox, when the Stepper sets any. Otherwise the TempoStrip goes by position. */
  tempoBoxes?: (number | undefined)[];
}

const StepContext = createContext<StepState | null>(null);

/** Holds the current Stepper step for one rendered tree. */
export function StepProvider({ children, tempoBoxes }: { children: ReactNode; tempoBoxes?: (number | undefined)[] }) {
  const [step, setStep] = useState(0);
  return <StepContext.Provider value={{ step, setStep, tempoBoxes }}>{children}</StepContext.Provider>;
}

/* ---------- Card ---------- */

export function CatalogCard({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3.5">{children}</div>;
}

/* ---------- Heading ---------- */

export function CatalogHeading({ text, meta }: { text: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="font-heading text-[22px] leading-none uppercase tracking-wide">{text}</h3>
      {meta ? <span className="tabular shrink-0 text-[13px] text-ink-muted">{meta}</span> : null}
    </div>
  );
}

/* ---------- Stepper ---------- */

/** The camera for each step: its own view, else the last view set before it, else "side". */
export function stepViews(steps: HowToStep[]): View[] {
  let view: View = "side";
  return steps.map((s) => (view = s.figure?.view ?? view));
}

export function Stepper({ steps }: { steps: HowToStep[] }) {
  const shared = useContext(StepContext);
  const [localStep, setLocalStep] = useState(0);
  const step = Math.min(shared?.step ?? localStep, steps.length - 1);
  const setStep = shared?.setStep ?? setLocalStep;
  const current = steps[step];
  const last = step === steps.length - 1;
  const views = stepViews(steps);

  return (
    <div className="flex flex-col gap-2.5">
      {current.figure ? (
        <PoseFigure
          lift={current.figure.lift}
          pose={current.figure.pose}
          marker={current.figure.marker}
          view={views[step]}
          viewKey={step}
          focus={current.figure.focus}
          flag={current.figure.flag}
          label={`${current.title}: ${poseLabel(current.figure.pose, current.figure.marker, current.figure.lift)}`}
        />
      ) : null}
      <ol className="flex gap-1" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={i} className="flex-1">
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === step ? "step" : undefined}
              className="group flex h-6 w-full cursor-pointer items-center rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span
                className={cx(
                  "h-1 w-full rounded-full transition-colors",
                  i <= step ? "bg-ink" : "bg-border group-hover:bg-ink-muted",
                )}
              />
            </button>
          </li>
        ))}
      </ol>
      <div aria-live="polite">
        <p className="tabular text-xs text-ink-muted">
          Step {step + 1} of {steps.length}
        </p>
        <p className="text-base font-semibold">{current.title}</p>
        <p className="mt-0.5 text-ink-muted">{current.cue}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="min-h-11" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        <Button variant="primary" className="min-h-11" onClick={() => setStep(last ? 0 : step + 1)}>
          {last ? "Start again" : "Next"}
        </Button>
      </div>
    </div>
  );
}

/* ---------- TempoStrip ---------- */

export function TempoStrip({ segments, follows }: { segments: string[]; follows?: "Stepper" }) {
  const shared = useContext(StepContext);
  // Following the Stepper: each step's tempoBox picks the box. Without any tempoBox,
  // step 1 highlights nothing, step 2 the first box, and so on.
  let active = -1;
  if (follows === "Stepper" && shared)
    active = shared.tempoBoxes ? (shared.tempoBoxes[shared.step] ?? 0) - 1 : shared.step - 1;
  return (
    <ol
      className="tabular grid gap-1.5 text-center text-xs"
      style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}
      aria-label="Tempo"
    >
      {segments.map((label, i) => (
        <li
          key={i}
          aria-current={i === active ? "step" : undefined}
          className={cx(
            "flex min-h-[30px] items-center justify-center rounded-sm border px-1 py-1",
            i === active ? "border-accent bg-accent-tint font-semibold" : "border-border bg-surface",
          )}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}

/* ---------- Callout ---------- */

const CALLOUT_STYLES: Record<CalloutTone, string> = {
  ok: "bg-ok-tint",
  flag: "bg-flag-tint",
  info: "bg-bg border border-border",
};

export function Callout({ tone, text }: { tone: CalloutTone; text: string }) {
  return <p className={cx("rounded-sm p-2.5 text-[13px]", CALLOUT_STYLES[tone])}>{text}</p>;
}

// The component catalog for declarative how-tos. The agent can only pick these parts and fill in
// their props; it never sends markup, styles or code. All text is rendered as React text.
// Colours come from theme tokens only (Tailwind utilities), so the parts work inside the chat too.

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button, cx } from "../ui";
import type { CalloutTone, HowToStep, Marker, Pose } from "./schema";

/* ---------- Step context: lets a TempoStrip follow the Stepper in the same tree ---------- */

interface StepState {
  step: number;
  setStep: (step: number) => void;
}

const StepContext = createContext<StepState | null>(null);

/** Holds the current Stepper step for one rendered tree. */
export function StepProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(0);
  return <StepContext.Provider value={{ step, setStep }}>{children}</StepContext.Provider>;
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

/* ---------- PoseFigure: preset stick figures only. The agent cannot pass coordinates. ---------- */

type Point = readonly [number, number];
interface PoseShape {
  knee: Point;
  hip: Point;
  shoulder: Point;
  head: Point;
}

const ANKLE: Point = [110, 192];

const POSE_SHAPES: Record<Pose, PoseShape> = {
  stand: { knee: [112, 150], hip: [106, 110], shoulder: [110, 56], head: [114, 38] },
  half: { knee: [130, 158], hip: [92, 132], shoulder: [104, 80], head: [110, 62] },
  bottom: { knee: [142, 164], hip: [88, 164], shoulder: [106, 114], head: [114, 96] },
};

const POSE_WORDS: Record<Pose, string> = {
  stand: "Standing tall with the bar on the upper back",
  half: "Halfway down",
  bottom: "At the bottom of the squat",
};

const MARKER_WORDS: Record<Marker, string> = {
  down: "moving down slowly",
  hold: "holding still",
  up: "driving up",
};

export function poseLabel(pose: Pose, marker?: Marker): string {
  return marker ? `${POSE_WORDS[pose]}, ${MARKER_WORDS[marker]}` : POSE_WORDS[pose];
}

export function PoseFigure({ pose, marker, label }: { pose: Pose; marker?: Marker; label?: string }) {
  const s = POSE_SHAPES[pose];
  const body = [ANKLE, s.knee, s.hip, s.shoulder].map((p) => p.join(",")).join(" ");
  return (
    <svg
      role="img"
      aria-label={label ?? poseLabel(pose, marker)}
      viewBox="0 0 220 210"
      className="block h-[170px] w-full rounded-sm bg-bg"
    >
      <line x1="30" y1="200" x2="190" y2="200" className="stroke-border" strokeWidth="2" />
      <line x1="100" y1="196" x2="132" y2="196" className="stroke-ink" strokeWidth="6" strokeLinecap="round" />
      <polyline
        points={body}
        fill="none"
        className="stroke-ink"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={s.head[0]} cy={s.head[1]} r="11" className="fill-ink" />
      <circle cx={s.shoulder[0] - 6} cy={s.shoulder[1] + 2} r="14" className="fill-accent stroke-ink" strokeWidth="2" />
      {marker === "down" ? (
        <path
          d="M178 70v60M168 120l10 12 10-12"
          fill="none"
          className="stroke-ink-muted"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {marker === "hold" ? (
        <path d="M170 135v26M186 135v26" fill="none" className="stroke-ink-muted" strokeWidth="5" strokeLinecap="round" />
      ) : null}
      {marker === "up" ? (
        <path
          d="M178 140v-60M168 92l10-12 10 12"
          fill="none"
          className="stroke-accent"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

/* ---------- Stepper ---------- */

export function Stepper({ steps }: { steps: HowToStep[] }) {
  const shared = useContext(StepContext);
  const [localStep, setLocalStep] = useState(0);
  const step = Math.min(shared?.step ?? localStep, steps.length - 1);
  const setStep = shared?.setStep ?? setLocalStep;
  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="flex flex-col gap-2.5">
      {current.figure ? (
        <PoseFigure
          pose={current.figure.pose}
          marker={current.figure.marker}
          label={`${current.title}: ${poseLabel(current.figure.pose, current.figure.marker)}`}
        />
      ) : null}
      <div className="flex gap-1" aria-hidden="true">
        {steps.map((_, i) => (
          <span key={i} className={cx("h-1 flex-1 rounded-full", i <= step ? "bg-ink" : "bg-border")} />
        ))}
      </div>
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
  // Following the Stepper: step 1 highlights nothing, step 2 the first box, and so on.
  const active = follows === "Stepper" && shared ? shared.step - 1 : -1;
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

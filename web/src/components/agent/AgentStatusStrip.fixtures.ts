import type { AgentStatusStripProps } from "./AgentStatusStrip";

/**
 * Realistic fixtures for the client "Aroha Tane" (42, avid tramper, sore left shoulder).
 */
export const idle: AgentStatusStripProps = {
  status: "idle",
};

export const searching: AgentStatusStripProps = {
  status: "working",
  steps: [
    { label: "Reading client profile", state: "done" },
    { label: "Searching exercise library", state: "active" },
    { label: "Building week 1", state: "pending" },
    { label: "Reviewing shoulder-safe alternatives", state: "pending" },
  ],
};

export const awaitingApproval: AgentStatusStripProps = {
  status: "awaiting-approval",
};

export const done: AgentStatusStripProps = {
  status: "done",
  summary: "4 steps · 2 cells changed",
  onShowSteps: () => alert("Show steps clicked"),
};

export const error: AgentStatusStripProps = {
  status: "error",
  errorMessage: "OpenRouter timed out after 30 s on step 2.",
  onRetry: () => alert("Retry clicked"),
  onSwitchModel: () => alert("Switch model clicked"),
};

export const allFixtures: { label: string; props: AgentStatusStripProps }[] = [
  { label: "Idle", props: idle },
  { label: "Working", props: searching },
  { label: "Awaiting approval", props: awaitingApproval },
  { label: "Done", props: done },
  { label: "Error", props: error },
];

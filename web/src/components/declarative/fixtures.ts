// Fixtures for the declarative how-to: the example tree from the build plan, plus bad variants.
// Used by HowTo.demo.tsx and schema.test.mjs. Only type imports here (erased under node --test).

import type { HowToNode } from "./schema";

/** The plan's example, verbatim. The agent should be able to produce this. */
export const pauseSquatHowTo: HowToNode = {
  type: "Card",
  children: [
    { type: "Heading", text: "Pause squat", meta: "Tempo 3-2-X" },
    {
      type: "Stepper",
      steps: [
        { title: "Brace", cue: "Big breath into your belly.", figure: { pose: "stand" } },
        { title: "Lower for 3 seconds", cue: "Knees track over the toes.", figure: { pose: "half", marker: "down" } },
        { title: "Pause for 2 seconds", cue: "Stay tight. No bounce.", figure: { pose: "bottom", marker: "hold" } },
        { title: "Drive up fast", cue: "Chest and hips rise together.", figure: { pose: "half", marker: "up" } },
      ],
    },
    { type: "TempoStrip", segments: ["3s down", "2s pause", "Up fast"], follows: "Stepper" },
    { type: "Callout", tone: "flag", text: "For Aroha: wider grip, elbows down." },
  ],
};

/** A smaller valid tree that uses the remaining catalog parts (nested Card, PoseFigure, ok and info Callouts). */
export const gobletSquatHowTo: HowToNode = {
  type: "Card",
  children: [
    { type: "Heading", text: "Goblet squat", meta: "3 x 8" },
    { type: "Card", children: [{ type: "PoseFigure", pose: "bottom", marker: "hold" }] },
    { type: "Callout", tone: "ok", text: "Shoulder friendly: the bell stays at the chest." },
    { type: "Callout", tone: "info", text: "Elbows inside the knees at the bottom." },
  ],
};

/** Not in the catalog. Must be rejected. */
export const scriptNode: unknown = {
  type: "Card",
  children: [{ type: "Script", src: "https://example.invalid/x.js" }],
};

/** A known type with a prop it does not have. Must be rejected. */
export const extraPropNode: unknown = {
  type: "Card",
  children: [{ type: "Heading", text: "Pause squat", html: "<b>Pause squat</b>" }],
};

/** Card nested `levels` deep, with a Heading at the bottom. */
export function nestedCards(levels: number): unknown {
  let node: unknown = { type: "Heading", text: "Deep" };
  for (let i = 0; i < levels; i++) node = { type: "Card", children: [node] };
  return node;
}

/** A Card whose children are `count` small cards with one Heading each (1 + 2 x count nodes). */
export function wideTree(count: number): unknown {
  return {
    type: "Card",
    children: Array.from({ length: count }, (_, i) => ({
      type: "Card",
      children: [{ type: "Heading", text: `Part ${i + 1}` }],
    })),
  };
}

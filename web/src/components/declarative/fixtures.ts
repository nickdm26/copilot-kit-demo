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

/** A non-squat lift: every figure names its lift. */
export const romanianDeadliftHowTo: HowToNode = {
  type: "Card",
  children: [
    { type: "Heading", text: "Romanian deadlift", meta: "3 x 8" },
    {
      type: "Stepper",
      steps: [
        { title: "Stand tall", cue: "Bar at the hips, lats tight.", figure: { lift: "deadlift", pose: "stand" } },
        {
          title: "Hips back",
          cue: "Soft knees. Bar slides down the thighs.",
          figure: { lift: "deadlift", pose: "half", marker: "down" },
        },
        {
          title: "Stand back up",
          cue: "Squeeze the glutes to finish.",
          figure: { lift: "deadlift", pose: "stand", marker: "up" },
        },
      ],
    },
    { type: "Callout", tone: "info", text: "Stop when the hamstrings stretch, usually just below the knee." },
  ],
};

/** A longer how-to: seven steps, all three views, a focus per step, the client's injury and tempo boxes. */
export const sarahPauseSquatHowTo: HowToNode = {
  type: "Card",
  children: [
    { type: "Heading", text: "Pause squat", meta: "Tempo 3-2-X" },
    {
      type: "Stepper",
      steps: [
        {
          title: "Set your stance",
          cue: "Feet about shoulder width, toes turned out a little.",
          figure: { pose: "stand", view: "front", focus: "foot" },
        },
        {
          title: "Grip and brace",
          cue: "Grip a little wider to ease the left shoulder. Big breath into your belly.",
          figure: { pose: "stand", flag: { part: "shoulder", side: "left" } },
        },
        {
          title: "Lower for 3 seconds",
          cue: "Sit down between your heels. Chest stays proud.",
          figure: { pose: "half", marker: "down", view: "side", focus: "hip" },
          tempoBox: 1,
        },
        {
          title: "Knees out",
          cue: "Knees track over the toes all the way down. Don't let them cave in.",
          figure: { pose: "bottom", marker: "down", view: "front", focus: "knee" },
          tempoBox: 1,
        },
        {
          title: "Pause for 2 seconds",
          cue: "Stay tight. No bounce. Back stays flat.",
          figure: { pose: "bottom", marker: "hold", view: "side", focus: "back" },
          tempoBox: 2,
        },
        {
          title: "Drive up fast",
          cue: "Chest and hips rise together.",
          figure: { pose: "half", marker: "up" },
          tempoBox: 3,
        },
        {
          title: "Stand tall",
          cue: "Squeeze the glutes at the top. Breathe, then go again.",
          figure: { pose: "stand", view: "angle" },
        },
      ],
    },
    { type: "TempoStrip", segments: ["3s down", "2s pause", "Up fast"], follows: "Stepper" },
    { type: "Callout", tone: "flag", text: "For Sarah: left shoulder. Wider grip, elbows down." },
  ],
};

/** One figure per lift and pose, for the demo page. */
export const LIFT_GALLERY = [
  { lift: "squat", poses: ["stand", "half", "bottom"] },
  { lift: "deadlift", poses: ["stand", "half", "bottom"] },
  { lift: "bench", poses: ["stand", "half", "bottom"] },
  { lift: "overhead", poses: ["stand", "half", "bottom"] },
  { lift: "row", poses: ["stand", "half", "bottom"] },
  { lift: "curl", poses: ["stand", "half", "bottom"] },
] as const;

/** Every camera view, for the demo page gallery. */
export const GALLERY_VIEWS = ["side", "angle", "front"] as const;

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

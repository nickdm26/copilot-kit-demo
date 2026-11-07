// Schema tests for the declarative how-to. The schema is the security boundary, so it keeps tests.
// Plain node:test, no browser and no rendering. Node 22.18+ strips the TypeScript types on import.
// Run from the repo root:  node --test "web/src/components/declarative/*.test.mjs"

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateHowTo, HOW_TO_LIMITS, LIFTS, VIEWS, BODY_PARTS } from "./schema.ts";
import {
  pauseSquatHowTo,
  gobletSquatHowTo,
  romanianDeadliftHowTo,
  sarahPauseSquatHowTo,
  scriptNode,
  extraPropNode,
  nestedCards,
  wideTree,
} from "./fixtures.ts";

const rejects = (input, pattern) => {
  const result = validateHowTo(input);
  assert.equal(result.ok, false, "expected the tree to be rejected");
  if (pattern) assert.match(result.error, pattern);
};

test("the plan's pause squat example passes", () => {
  const result = validateHowTo(pauseSquatHowTo);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  assert.deepEqual(result.tree, pauseSquatHowTo);
});

test("the example also passes as a JSON string", () => {
  assert.equal(validateHowTo(JSON.stringify(pauseSquatHowTo)).ok, true);
});

test("a null optional prop counts as absent", () => {
  assert.equal(validateHowTo({ type: "Heading", text: "Pause squat", meta: null }).ok, true);
  rejects({ type: "Heading", text: null });
});

test("every catalog type passes", () => {
  assert.equal(validateHowTo(gobletSquatHowTo).ok, true);
});

test("figures for other lifts pass", () => {
  assert.equal(validateHowTo(romanianDeadliftHowTo).ok, true);
  for (const lift of LIFTS) assert.equal(validateHowTo({ type: "PoseFigure", lift, pose: "bottom" }).ok, true, lift);
  rejects({ type: "PoseFigure", lift: "handstand", pose: "stand" });
  rejects({ type: "Stepper", steps: [{ title: "Pull", cue: "Chin over.", figure: { lift: "pullup", pose: "stand" } }] });
});

test("views, focus and flags pass; unknown values and extra props fail", () => {
  assert.equal(validateHowTo(sarahPauseSquatHowTo).ok, true);
  for (const view of VIEWS) assert.equal(validateHowTo({ type: "PoseFigure", pose: "half", view }).ok, true, view);
  for (const focus of BODY_PARTS) assert.equal(validateHowTo({ type: "PoseFigure", pose: "half", focus }).ok, true, focus);
  const flag = { type: "PoseFigure", pose: "bottom", flag: { part: "shoulder", side: "left" } };
  assert.equal(validateHowTo(flag).ok, true);
  assert.equal(validateHowTo({ ...flag, flag: { part: "knee" } }).ok, true);
  assert.equal(validateHowTo({ ...flag, flag: { part: "knee", side: null } }).ok, true);
  rejects({ type: "PoseFigure", pose: "half", view: "top" });
  rejects({ type: "PoseFigure", pose: "half", focus: "spleen" });
  rejects({ ...flag, flag: { part: "shoulder", side: "both" } });
  rejects({ ...flag, flag: { side: "left" } });
  rejects({ ...flag, flag: { part: "shoulder", colour: "red" } });
  rejects({ ...flag, flag: "left shoulder" });
  rejects({ type: "PoseFigure", pose: "half", view: "front", camera: { yaw: 30 } });
});

test(`up to ${HOW_TO_LIMITS.maxSteps} steps pass and more fail`, () => {
  const steps = (n) => Array.from({ length: n }, (_, i) => ({ title: `Step ${i + 1}`, cue: "Keep going." }));
  assert.equal(validateHowTo({ type: "Stepper", steps: steps(HOW_TO_LIMITS.maxSteps) }).ok, true);
  rejects({ type: "Stepper", steps: steps(HOW_TO_LIMITS.maxSteps + 1) });
});

test("tempoBox must be a whole number that points at a real TempoStrip box", () => {
  const tree = (tempoBox, segments = ["3s down", "2s pause", "Up fast"]) => ({
    type: "Card",
    children: [
      { type: "Stepper", steps: [{ title: "Lower", cue: "Slowly.", tempoBox }] },
      { type: "TempoStrip", segments, follows: "Stepper" },
    ],
  });
  assert.equal(validateHowTo(tree(3)).ok, true);
  rejects(tree(4), /tempoBox 4 but the TempoStrip has 3 boxes/);
  rejects(tree(0));
  rejects(tree(1.5));
  rejects(tree("1"));
  // With no TempoStrip following the Stepper, only the schema's range applies.
  assert.equal(validateHowTo({ type: "Stepper", steps: [{ title: "Lower", cue: "Slowly.", tempoBox: 6 }] }).ok, true);
  rejects({ type: "Stepper", steps: [{ title: "Lower", cue: "Slowly.", tempoBox: 7 }] });
});

test('a node with "type": "Script" fails', () => {
  rejects(scriptNode, /not a catalog type/);
  rejects({ type: "Script" }, /not a catalog type/);
});

test("extra props fail", () => {
  rejects(extraPropNode, /html/);
  rejects({ type: "Card", children: [{ type: "Callout", tone: "flag", text: "x", style: "color:red" }] });
  rejects({ type: "PoseFigure", pose: "stand", points: [[0, 0]] });
  rejects({
    type: "Stepper",
    steps: [{ title: "Brace", cue: "Breathe.", figure: { pose: "stand", x: 10 } }],
  });
});

test("wrong types and unknown enum values fail", () => {
  rejects({ type: "Heading", text: 42 });
  rejects({ type: "PoseFigure", pose: "handstand" });
  rejects({ type: "Callout", tone: "danger", text: "x" });
  rejects({ type: "TempoStrip", segments: ["3s down"], follows: "Heading" });
  rejects({ type: "Card", children: "not an array" });
  rejects(null);
  rejects("{not json");
});

test(`depth ${HOW_TO_LIMITS.maxDepth} passes and depth ${HOW_TO_LIMITS.maxDepth + 1} fails`, () => {
  // n Cards plus the Heading at the bottom is depth n + 1.
  assert.equal(validateHowTo(nestedCards(HOW_TO_LIMITS.maxDepth - 1)).ok, true);
  rejects(nestedCards(HOW_TO_LIMITS.maxDepth), /deeper/);
  rejects(nestedCards(40)); // pathological nesting is stopped before the schema runs
});

test(`${HOW_TO_LIMITS.maxNodes} nodes pass and more fail`, () => {
  // wideTree(n) has 1 + 2n nodes. 1 + 17 + 17 + 15 = exactly 50.
  const exactly50 = { type: "Card", children: [wideTree(8), wideTree(8), wideTree(7)] };
  assert.equal(validateHowTo(exactly50).ok, true);
  const tooMany = {
    type: "Card",
    children: Array.from({ length: 3 }, () => wideTree(9)), // 1 + 3 x (1 + 2 x 9) = 58
  };
  rejects(tooMany, /more than 50 nodes/);
});

test("at most one Stepper", () => {
  const stepper = pauseSquatHowTo.children[1];
  rejects({ type: "Card", children: [stepper, stepper] }, /Stepper/);
});

// Declarative how-to: the schema for the JSON tree the agent sends with showHowTo.
// This file is the security boundary. A tree is rendered only if it passes validateHowTo().
// Keep it free of React and of relative imports: node --test loads it directly (see schema.test.mjs).
// The agent-side mirror is agent/Tools/ShowHowToTool.cs; keep the two in step.

import { z } from "zod";

export const HOW_TO_LIMITS = {
  /** Deepest allowed nesting of typed nodes. The root is depth 1. */
  maxDepth: 4,
  /** Most typed nodes in one tree (every object with a "type"). */
  maxNodes: 50,
  /** Upper bound on the raw JSON, checked before the schema runs. */
  maxJsonChars: 20_000,
  maxChildren: 20,
  maxSteps: 8,
  maxSegments: 6,
} as const;

export const POSES = ["stand", "half", "bottom"] as const;
export const MARKERS = ["down", "hold", "up"] as const;
export const CALLOUT_TONES = ["ok", "flag", "info"] as const;

const text = (max: number) => z.string().trim().min(1).max(max);

export const PoseFigurePropsSchema = z
  .object({
    pose: z.enum(POSES),
    marker: z.enum(MARKERS).optional(),
  })
  .strict();

export const StepSchema = z
  .object({
    title: text(60),
    cue: text(160),
    figure: PoseFigurePropsSchema.optional(),
  })
  .strict();

const HeadingSchema = z.object({ type: z.literal("Heading"), text: text(80), meta: text(40).optional() }).strict();

const StepperSchema = z
  .object({ type: z.literal("Stepper"), steps: z.array(StepSchema).min(1).max(HOW_TO_LIMITS.maxSteps) })
  .strict();

const PoseFigureSchema = PoseFigurePropsSchema.extend({ type: z.literal("PoseFigure") }).strict();

const TempoStripSchema = z
  .object({
    type: z.literal("TempoStrip"),
    segments: z.array(text(24)).min(1).max(HOW_TO_LIMITS.maxSegments),
    follows: z.literal("Stepper").optional(),
  })
  .strict();

const CalloutSchema = z.object({ type: z.literal("Callout"), tone: z.enum(CALLOUT_TONES), text: text(280) }).strict();

export type HeadingNode = z.infer<typeof HeadingSchema>;
export type StepperNode = z.infer<typeof StepperSchema>;
export type PoseFigureNode = z.infer<typeof PoseFigureSchema>;
export type TempoStripNode = z.infer<typeof TempoStripSchema>;
export type CalloutNode = z.infer<typeof CalloutSchema>;
export type CardNode = { type: "Card"; children: HowToNode[] };
export type HowToNode = CardNode | HeadingNode | StepperNode | PoseFigureNode | TempoStripNode | CalloutNode;
export type HowToStep = z.infer<typeof StepSchema>;
export type Pose = (typeof POSES)[number];
export type Marker = (typeof MARKERS)[number];
export type CalloutTone = (typeof CALLOUT_TONES)[number];

const CardSchema = z
  .object({
    type: z.literal("Card"),
    children: z.lazy((): z.ZodType<HowToNode[]> => z.array(HowToNodeSchema).min(1).max(HOW_TO_LIMITS.maxChildren)),
  })
  .strict();

/** One catalog node. Unknown types, unknown props and wrong types are all rejected. */
export const HowToNodeSchema: z.ZodType<HowToNode> = z.discriminatedUnion("type", [
  CardSchema,
  HeadingSchema,
  StepperSchema,
  PoseFigureSchema,
  TempoStripSchema,
  CalloutSchema,
]);

/** The full args of the showHowTo tool. */
export const ShowHowToArgsSchema = z.object({ ui: HowToNodeSchema }).strict();

export const CATALOG_TYPES = ["Card", "Heading", "Stepper", "PoseFigure", "TempoStrip", "Callout"] as const;

export type HowToResult = { ok: true; tree: HowToNode } | { ok: false; error: string };

/** Depth and size of the raw JSON, before zod sees it. Stops huge or deeply nested input early. */
function rawShapeError(input: unknown): string | null {
  let json: string | undefined;
  try {
    json = JSON.stringify(input);
  } catch {
    return "not plain JSON";
  }
  if (json === undefined) return "empty";
  if (json.length > HOW_TO_LIMITS.maxJsonChars) return `larger than ${HOW_TO_LIMITS.maxJsonChars} characters`;
  // Each typed level is at most three JSON levels deep (node -> children array -> node).
  const maxJsonDepth = HOW_TO_LIMITS.maxDepth * 3 + 4;
  const tooDeep = (value: unknown, depth: number): boolean => {
    if (depth > maxJsonDepth) return true;
    if (Array.isArray(value)) return value.some((v) => tooDeep(v, depth + 1));
    if (value && typeof value === "object") return Object.values(value).some((v) => tooDeep(v, depth + 1));
    return false;
  };
  return tooDeep(input, 1) ? "nested too deeply" : null;
}

/** Copy of the input with null-valued object props removed (models often send `"meta": null`). Array items are kept. */
function dropNullProps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNullProps);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== null) out[k] = dropNullProps(v);
    return out;
  }
  return value;
}

function measure(node: HowToNode, depth: number, acc: { maxDepth: number; nodes: number; steppers: number }) {
  acc.nodes += 1;
  acc.maxDepth = Math.max(acc.maxDepth, depth);
  if (node.type === "Stepper") acc.steppers += 1;
  if (node.type === "Card") for (const child of node.children) measure(child, depth + 1, acc);
}

function describeIssue(issue: z.ZodIssue): string {
  const where = issue.path.length ? issue.path.join(".") : "root";
  if (issue.code === "invalid_union_discriminator")
    return `${where}: not a catalog type (allowed: ${CATALOG_TYPES.join(", ")})`;
  return `${where}: ${issue.message}`;
}

/**
 * Validate a how-to tree from the agent. Accepts the tree itself, or a JSON string of it
 * (some models stringify nested objects). Never throws.
 */
export function validateHowTo(input: unknown): HowToResult {
  let value = input;
  if (typeof value === "string") {
    if (value.length > HOW_TO_LIMITS.maxJsonChars) return { ok: false, error: "larger than the size limit" };
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, error: "not valid JSON" };
    }
  }
  const shape = rawShapeError(value);
  if (shape) return { ok: false, error: shape };

  const parsed = HowToNodeSchema.safeParse(dropNullProps(value));
  if (!parsed.success) return { ok: false, error: parsed.error.issues.slice(0, 3).map(describeIssue).join("; ") };

  const acc = { maxDepth: 0, nodes: 0, steppers: 0 };
  measure(parsed.data, 1, acc);
  if (acc.maxDepth > HOW_TO_LIMITS.maxDepth) return { ok: false, error: `deeper than ${HOW_TO_LIMITS.maxDepth} levels` };
  if (acc.nodes > HOW_TO_LIMITS.maxNodes) return { ok: false, error: `more than ${HOW_TO_LIMITS.maxNodes} nodes` };
  if (acc.steppers > 1) return { ok: false, error: "more than one Stepper" };
  return { ok: true, tree: parsed.data };
}

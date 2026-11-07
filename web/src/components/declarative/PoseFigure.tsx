// PoseFigure: a preset stick figure, built in 3D (figure3d.ts) and drawn from a camera angle.
// The agent picks lift, pose, marker, view and the body parts to ring; it cannot pass coordinates.
// The trainer can turn the figure with the view buttons or by dragging it sideways.
// Colours are theme tokens only (CSS variables and Tailwind utilities).

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cx } from "../ui";
import {
  BODIES,
  buildScene,
  cameraFor,
  lerpBody,
  lerpCamera,
  poseWords,
  type Camera,
  type Chain,
  type Highlight,
  type Part,
  type Point,
} from "./figure3d";
import type { BodyPart, FigureFlag, Lift, Marker, Pose, View } from "./schema";

const MOVE_MS = 420;
const TURN_MS = 650;
/** Width of the background outline that separates overlapping limbs. */
const HALO = 3;
const DRAG_DEG_PER_PX = 0.9;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** The value to draw: glides from the last drawn value to `target` whenever the target changes. */
function useTween<T>(target: T, mix: (a: T, b: T, t: number) => T, ms: number, instant = false): T {
  const [value, setValue] = useState(target);
  const drawn = useRef(target);
  useEffect(() => {
    const from = drawn.current;
    if (from === target) return;
    if (instant || reducedMotion()) {
      drawn.current = target;
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const next = t === 1 ? target : mix(from, target, ease(t));
      drawn.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, instant, mix, ms]);
  return value;
}

/* ---------- Words for screen readers ---------- */

const MARKER_WORDS: Record<Marker, string> = {
  down: "moving down slowly",
  hold: "holding still",
  up: "driving up",
};

export function poseLabel(pose: Pose, marker?: Marker, lift: Lift = "squat"): string {
  const words = poseWords(lift, pose);
  return marker ? `${words}, ${MARKER_WORDS[marker]}` : words;
}

const VIEW_WORDS: Record<View, string> = { side: "Side view", front: "Front view", angle: "Angled view" };
const PART_WORDS: Record<BodyPart, [both: string, one: string]> = {
  head: ["head", "head"],
  shoulder: ["shoulders", "shoulder"],
  elbow: ["elbows", "elbow"],
  hand: ["hands", "hand"],
  chest: ["chest", "chest"],
  back: ["back", "back"],
  hip: ["hips", "hip"],
  knee: ["knees", "knee"],
  foot: ["feet", "foot"],
};

function flagWords(flag: FigureFlag): string {
  const [both, one] = PART_WORDS[flag.part];
  return flag.side ? `${flag.side === "left" ? "Left" : "Right"} ${one} flagged.` : `${both[0].toUpperCase()}${both.slice(1)} flagged.`;
}

/* ---------- Drawing ---------- */

// Far-side limbs fade towards the background, as before. Mixing tokens keeps both themes right.
const FAR_INK = "color-mix(in srgb, var(--ink-muted) 55%, var(--bg))";
function ink(far: number): string {
  if (far <= 0.02) return "var(--ink)";
  if (far >= 0.98) return FAR_INK;
  return `color-mix(in srgb, var(--ink) ${Math.round((1 - far) * 100)}%, ${FAR_INK})`;
}

const pts = (list: readonly Point[]) => list.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

function PartView({ part, halo = false }: { part: Part; halo?: boolean }) {
  const grow = halo ? HALO : 0;
  switch (part.kind) {
    case "seg": {
      const colour = halo ? "var(--bg)" : ink(part.far);
      return (
        <line
          x1={part.a[0]}
          y1={part.a[1]}
          x2={part.b[0]}
          y2={part.b[1]}
          strokeWidth={part.w + grow}
          strokeLinecap="round"
          style={{ stroke: colour }}
        />
      );
    }
    case "poly": {
      const colour = halo ? "var(--bg)" : ink(part.far);
      return (
        <polygon points={pts(part.pts)} strokeWidth={part.w + grow} strokeLinejoin="round" style={{ fill: colour, stroke: colour }} />
      );
    }
    case "dot":
      if (part.fill === "bg") return halo ? null : <circle cx={part.c[0]} cy={part.c[1]} r={part.r} style={{ fill: "var(--bg)" }} />;
      return (
        <circle cx={part.c[0]} cy={part.c[1]} r={part.r + grow / 2} style={{ fill: halo ? "var(--bg)" : ink(part.far) }} />
      );
    case "plate":
      // A weight plate: a full disc side on, a thin edge from the front.
      if (halo) return <ellipse cx={part.c[0]} cy={part.c[1]} rx={part.rx + 1 + grow / 2} ry={part.ry + 1 + grow / 2} style={{ fill: "var(--bg)" }} />;
      return (
        <g opacity={1 - 0.5 * part.far}>
          <ellipse cx={part.c[0]} cy={part.c[1]} rx={part.rx} ry={part.ry} className="fill-accent stroke-ink" strokeWidth="2" />
          {part.rx > 7 ? (
            <ellipse
              cx={part.c[0]}
              cy={part.c[1]}
              rx={part.rx * 0.62}
              ry={part.ry * 0.62}
              fill="none"
              className="stroke-ink"
              strokeWidth="1.5"
              opacity="0.35"
            />
          ) : null}
          {part.sleeve ? <circle cx={part.c[0]} cy={part.c[1]} r={3.5} className="fill-ink" /> : null}
        </g>
      );
  }
}

/** One chain: every part's halo first, then the parts, so a limb has no seams but stands out from what is behind. */
function ChainView({ chain }: { chain: Chain }) {
  return (
    <g>
      {chain.parts.map((part, i) => (
        <PartView key={`halo-${i}`} part={part} halo />
      ))}
      {chain.parts.map((part, i) => (
        <PartView key={i} part={part} />
      ))}
    </g>
  );
}

function capsule(a: Point, b: Point, r: number): string {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (-(b[1] - a[1]) / len) * r;
  const ny = ((b[0] - a[0]) / len) * r;
  const p = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
  return `M${p(a[0] + nx, a[1] + ny)} L${p(b[0] + nx, b[1] + ny)} A${r},${r} 0 0 0 ${p(b[0] - nx, b[1] - ny)} L${p(a[0] - nx, a[1] - ny)} A${r},${r} 0 0 0 ${p(a[0] + nx, a[1] + ny)} Z`;
}

function HighlightView({ h }: { h: Highlight }) {
  const flag = h.tone === "flag";
  const tone = flag ? "fill-flag stroke-flag" : "fill-accent stroke-accent";
  // The side badge sits on the ring's top-right edge (or the end of a capsule).
  const badge: Point = h.kind === "ring" ? [h.c[0] + h.r * 0.75, h.c[1] - h.r * 0.75] : [h.b[0], h.b[1] - h.r];
  return (
    <g>
      {h.kind === "ring" ? (
        <circle cx={h.c[0]} cy={h.c[1]} r={h.r} className={tone} fillOpacity="0.2" strokeWidth="2.5" />
      ) : (
        <path d={capsule(h.a, h.b, h.r)} className={tone} fillOpacity="0.2" strokeWidth="2.5" />
      )}
      {h.label ? (
        <g>
          <circle
            cx={badge[0]}
            cy={badge[1]}
            r="6.5"
            className={flag ? "fill-flag" : "fill-accent"}
            strokeWidth="1.5"
            style={{ stroke: "var(--bg)" }}
          />
          <text
            x={badge[0]}
            y={badge[1] + 0.5}
            fontSize="9"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-on-fill"
          >
            {h.label}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/* ---------- PoseFigure ---------- */

const VIEW_BUTTONS: { view: View; label: string }[] = [
  { view: "side", label: "Side" },
  { view: "angle", label: "45°" },
  { view: "front", label: "Front" },
];

export interface PoseFigureProps {
  lift?: Lift;
  pose: Pose;
  marker?: Marker;
  view?: View;
  focus?: BodyPart;
  flag?: FigureFlag;
  /** What the figure shows, for screen readers. Defaults to the pose's words. */
  label?: string;
  /** Change it (e.g. to the step number) to send the camera back to `view` after the trainer turned it. */
  viewKey?: number;
  /** Show the view buttons. */
  controls?: boolean;
}

export function PoseFigure({
  lift = "squat",
  pose,
  marker,
  view = "side",
  focus,
  flag,
  label,
  viewKey,
  controls = true,
}: PoseFigureProps) {
  const body = useTween(BODIES[lift][pose], lerpBody, MOVE_MS);

  // Where the camera is heading: the view's preset, or wherever the trainer dragged it.
  const [aim, setAim] = useState<Camera>(() => cameraFor(lift, view));
  useEffect(() => setAim(cameraFor(lift, view)), [lift, view, viewKey]);
  const [dragging, setDragging] = useState(false);
  const camera = useTween(aim, lerpCamera, TURN_MS, dragging);
  const drag = useRef<{ id: number; x: number; yaw: number } | null>(null);

  const scene = buildScene({ lift, body, camera, focus, flag });
  const active = VIEW_BUTTONS.find((b) => cameraFor(lift, b.view) === aim)?.view;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, yaw: camera.yaw };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!dragging && Math.abs(dx) < 3) return;
    setDragging(true);
    setAim({ yaw: d.yaw + dx * DRAG_DEG_PER_PX, pitch: camera.pitch });
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  const words = [
    `${active ? VIEW_WORDS[active] : "Turned view"}. ${label ?? poseLabel(pose, marker, lift)}.`,
    focus ? `Watch the ${PART_WORDS[focus][0]}.` : "",
    flag ? flagWords(flag) : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="relative">
      <svg
        role="img"
        aria-label={words}
        viewBox={scene.viewBox.join(" ")}
        className={cx("block h-[170px] w-full touch-pan-y select-none rounded-sm bg-bg", dragging ? "cursor-grabbing" : "cursor-grab")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <line x1="30" y1="200" x2="190" y2="200" className="stroke-border" strokeWidth="2" />
        <ellipse cx={scene.shadow.c[0]} cy={scene.shadow.c[1]} rx={scene.shadow.rx} ry={scene.shadow.ry} className="fill-border" />
        {scene.bench ? (
          <g>
            {scene.bench.legs.map(([a, b], i) => (
              <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="stroke-border" strokeWidth="6" />
            ))}
            <polygon points={pts(scene.bench.frame)} className="fill-border stroke-border" strokeWidth="1" strokeLinejoin="round" />
            <polygon points={pts(scene.bench.pad)} className="fill-ink-muted stroke-ink-muted" strokeWidth="2" strokeLinejoin="round" />
          </g>
        ) : null}

        {/* Bar path for the whole rep. */}
        <polyline
          points={pts(scene.path)}
          fill="none"
          className="stroke-accent"
          strokeWidth="2"
          strokeDasharray="3 5"
          strokeLinecap="round"
          opacity="0.55"
        />

        {scene.highlights.map((h, i) => (h.kind === "capsule" && h.under ? <HighlightView key={i} h={h} /> : null))}
        {scene.chains.map((chain) => (
          <ChainView key={chain.key} chain={chain} />
        ))}
        {scene.highlights.map((h, i) => (h.kind === "capsule" && h.under ? null : <HighlightView key={i} h={h} />))}

        {marker === "down" ? (
          <path
            d="M196 70v60M186 120l10 12 10-12"
            fill="none"
            className="stroke-ink-muted"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {marker === "hold" ? (
          <path d="M188 135v26M204 135v26" fill="none" className="stroke-ink-muted" strokeWidth="5" strokeLinecap="round" />
        ) : null}
        {marker === "up" ? (
          <path
            d="M196 140v-60M186 92l10-12 10 12"
            fill="none"
            className="stroke-accent"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      {controls ? (
        <div
          role="group"
          aria-label="Camera view"
          className="absolute top-1.5 right-1.5 flex overflow-hidden rounded-sm border border-border bg-surface"
        >
          {VIEW_BUTTONS.map(({ view: v, label: text }) => (
            <button
              key={v}
              type="button"
              aria-pressed={active === v}
              onClick={() => setAim(cameraFor(lift, v))}
              className={cx(
                "min-h-7 min-w-10 cursor-pointer px-1.5 text-[11px] font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                active === v ? "bg-ink text-bg" : "text-ink-muted hover:bg-bg hover:text-ink",
              )}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

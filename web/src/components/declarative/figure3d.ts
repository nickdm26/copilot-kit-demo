// The how-to stick figures as simple 3D bodies, drawn from a camera angle.
// Pure data and maths, no React and only type imports: figure.test.mjs loads it under node --test.
// Every pose is a preset. The agent picks lift, pose, view and body parts by name; it never sends coordinates.

import type { BodyPart, FigureFlag, Lift, Pose, View } from "./schema";

/** x = forward (the way the figure faces), y = down (the floor is y = 200), z = the figure's right. About 1 cm a unit. */
export type Vec3 = readonly [number, number, number];
export type Point = readonly [number, number];

const DEG = Math.PI / 180;
const FLOOR = 200;
const FOOT_Y = 196;
/** Screen x of the figure's midline when the camera looks from the front. */
const CENTRE_X = 110;
export const VIEW_WIDTH = 220;
/** A little room below the floor: from above, near plates and feet sit a few units lower. */
const VIEW_BOTTOM = 214;

/* ---------- Lift presets: side-on (x, y) points plus half-widths for the third dimension ---------- */

interface SidePose {
  ankle: Point;
  knee: Point;
  hip: Point;
  shoulder: Point;
  head: Point;
  /** Elbow, then hand. */
  arm: readonly [Point, Point];
  /** Centre of the bar. */
  bar: Point;
}

/** Distance of each joint from the midline (z). */
interface Widths {
  ankle: number;
  hip: number;
  shoulder: number;
  elbow: number;
  hand: number;
  /** Missing means the knees track over the toes (they follow the foot's angle). */
  knee?: number;
}

interface LiftDef {
  poses: Record<Pose, SidePose>;
  words: Record<Pose, string>;
  widths: Widths;
  /** Width changes for one pose, e.g. elbows flaring at the bottom of a bench press. */
  poseWidths?: Partial<Record<Pose, Partial<Widths>>>;
  /** How far the toes turn out, in degrees. */
  toeOut: number;
  /** The bar sits on the upper back, behind the torso. */
  barOnBack?: boolean;
  /** Draw a flat bench under the figure. */
  bench?: boolean;
  /** Top of the viewBox. Below 0 makes room for a bar overhead. */
  top?: number;
  plateRadius?: number;
  /** Half the bar's length. The plates sit 6 in from each end. */
  barHalf?: number;
  /** The x the camera turns around. */
  pivot?: number;
  /** The floor x the camera tips down about (it stays on the floor line). Defaults to the pivot. */
  tilt?: number;
  /** Floor shadow: centre x and radius. */
  shadow?: { x: number; r: number };
  cameras?: Partial<Record<View, Camera>>;
}

// Every figure faces right (+x), with the floor at y = 200.
const STAND = { ankle: [110, 192], knee: [112, 150], hip: [106, 110], shoulder: [110, 56], head: [114, 38] } as const;

// Bar on the upper back; elbows down and back, hands just outside the shoulders.
const squat = (knee: Point, hip: Point, shoulder: Point, head: Point): SidePose => ({
  ankle: STAND.ankle,
  knee,
  hip,
  shoulder,
  head,
  arm: [
    [shoulder[0] - 16, shoulder[1] + 20],
    [shoulder[0] - 9, shoulder[1] + 4],
  ],
  bar: [shoulder[0] - 6, shoulder[1] + 2],
});

const BENCH_BODY = { ankle: [152, 192], knee: [148, 140], hip: [118, 152], shoulder: [62, 152], head: [44, 146] } as const;
const ROW_BODY = { ankle: [110, 192], knee: [122, 154], hip: [82, 134], shoulder: [132, 110], head: [147, 101] } as const;
// Head back so the arms and bar clear the face.
const PRESS_BODY = { ...STAND, head: [100, 40] } as const;

export const LIFT_DEFS: Record<Lift, LiftDef> = {
  squat: {
    toeOut: 20,
    barOnBack: true,
    widths: { ankle: 21, hip: 11, shoulder: 19, elbow: 30, hand: 27 },
    poses: {
      stand: squat([112, 150], [106, 110], [110, 56], [114, 38]),
      half: squat([130, 158], [92, 132], [104, 80], [110, 62]),
      bottom: squat([142, 164], [88, 164], [106, 114], [114, 96]),
    },
    words: {
      stand: "Standing tall with the bar on the upper back",
      half: "Halfway down",
      bottom: "At the bottom of the squat",
    },
  },
  deadlift: {
    toeOut: 8,
    widths: { ankle: 13, hip: 11, shoulder: 19, elbow: 21, hand: 23 },
    poses: {
      stand: { ...STAND, arm: [[111, 88], [113, 120]], bar: [114, 122] },
      half: {
        ankle: [110, 192],
        knee: [124, 152],
        hip: [82, 136],
        shoulder: [118, 98],
        head: [132, 88],
        arm: [[120, 128], [122, 156]],
        bar: [122, 156],
      },
      bottom: {
        ankle: [110, 192],
        knee: [134, 160],
        hip: [88, 150],
        shoulder: [130, 118],
        head: [144, 106],
        arm: [[129, 151], [128, 184]],
        bar: [128, 186],
      },
    },
    words: {
      stand: "Standing tall at lockout, bar at the hips",
      half: "Hips back, bar at the knees",
      bottom: "Set up with the bar on the floor",
    },
  },
  bench: {
    bench: true,
    toeOut: 15,
    pivot: 96,
    // Tip the camera about the feet, so they stay in frame when it looks down from the foot end.
    tilt: 150,
    shadow: { x: 92, r: 66 },
    // From the foot end and higher up, so the knees don't hide the chest.
    cameras: { front: { yaw: 90, pitch: 30 }, angle: { yaw: 45, pitch: 20 } },
    widths: { ankle: 27, knee: 25, hip: 11, shoulder: 21, elbow: 31, hand: 37 },
    poseWidths: { half: { elbow: 36 }, bottom: { elbow: 38 } },
    poses: {
      stand: { ...BENCH_BODY, arm: [[64, 120], [66, 90]], bar: [66, 88] },
      half: { ...BENCH_BODY, arm: [[54, 132], [68, 116]], bar: [68, 114] },
      bottom: { ...BENCH_BODY, arm: [[50, 146], [70, 136]], bar: [70, 134] },
    },
    words: {
      stand: "Lying on the bench, arms locked out",
      half: "Bar halfway down",
      bottom: "Bar touching the chest",
    },
  },
  overhead: {
    top: -30,
    toeOut: 10,
    widths: { ankle: 14, hip: 11, shoulder: 19, elbow: 22, hand: 25 },
    poseWidths: { half: { elbow: 27 }, bottom: { elbow: 26 } },
    poses: {
      stand: { ...PRESS_BODY, arm: [[112, 24], [112, -6]], bar: [112, -8] },
      half: { ...PRESS_BODY, arm: [[126, 40], [122, 14]], bar: [122, 12] },
      bottom: { ...PRESS_BODY, arm: [[128, 76], [132, 52]], bar: [132, 50] },
    },
    words: {
      stand: "Bar locked out overhead",
      half: "Bar passing the forehead",
      bottom: "Bar resting at the shoulders",
    },
  },
  row: {
    toeOut: 8,
    widths: { ankle: 15, hip: 11, shoulder: 19, elbow: 22, hand: 22 },
    poseWidths: { stand: { elbow: 27 }, half: { elbow: 25 } },
    poses: {
      stand: { ...ROW_BODY, arm: [[104, 104], [110, 132]], bar: [110, 134] },
      half: { ...ROW_BODY, arm: [[112, 130], [124, 152]], bar: [124, 152] },
      bottom: { ...ROW_BODY, arm: [[133, 140], [134, 170]], bar: [134, 172] },
    },
    words: {
      stand: "Bent over, bar pulled to the belly",
      half: "Bent over, bar halfway up",
      bottom: "Bent over, arms long",
    },
  },
  curl: {
    toeOut: 8,
    plateRadius: 11,
    barHalf: 36,
    widths: { ankle: 13, hip: 11, shoulder: 19, elbow: 22, hand: 19 },
    poses: {
      stand: { ...STAND, arm: [[112, 88], [126, 60]], bar: [127, 59] },
      half: { ...STAND, arm: [[110, 88], [140, 88]], bar: [141, 88] },
      bottom: { ...STAND, arm: [[110, 88], [113, 118]], bar: [114, 118] },
    },
    words: {
      stand: "Bar curled up to the shoulders",
      half: "Forearms level with the floor",
      bottom: "Arms long, bar at the thighs",
    },
  },
};

/* ---------- 3D bodies ---------- */

interface Limbs {
  heel: Vec3;
  toe: Vec3;
  ankle: Vec3;
  knee: Vec3;
  hip: Vec3;
  shoulder: Vec3;
  elbow: Vec3;
  hand: Vec3;
}

export interface Body {
  right: Limbs;
  left: Limbs;
  head: Vec3;
  /** Points from the neck to the top of the head. */
  crown: Vec3;
  /** Points the way the face looks. */
  face: Vec3;
  bar: Vec3;
  barHalf: number;
  plateR: number;
}

const LIMB_KEYS = ["heel", "toe", "ankle", "knee", "hip", "shoulder", "elbow", "hand"] as const;

function buildBody(def: LiftDef, pose: Pose): Body {
  const s = def.poses[pose];
  const w: Widths = { ...def.widths, ...def.poseWidths?.[pose] };
  const toeOut = def.toeOut * DEG;
  const limbs = (sign: 1 | -1): Limbs => {
    const ankleZ = sign * w.ankle;
    const kneeOut = w.knee ?? w.ankle + Math.max(0, s.knee[0] - s.ankle[0]) * Math.tan(toeOut);
    const fx = Math.cos(toeOut);
    const fz = sign * Math.sin(toeOut);
    return {
      heel: [s.ankle[0] - 6 * fx, FOOT_Y, ankleZ - 6 * fz],
      toe: [s.ankle[0] + 18 * fx, FOOT_Y, ankleZ + 18 * fz],
      ankle: [s.ankle[0], s.ankle[1], ankleZ],
      knee: [s.knee[0], s.knee[1], sign * kneeOut],
      hip: [s.hip[0], s.hip[1], sign * w.hip],
      shoulder: [s.shoulder[0], s.shoulder[1], sign * w.shoulder],
      elbow: [s.arm[0][0], s.arm[0][1], sign * w.elbow],
      hand: [s.arm[1][0], s.arm[1][1], sign * w.hand],
    };
  };
  const nx = s.head[0] - s.shoulder[0];
  const ny = s.head[1] - s.shoulder[1];
  const len = Math.hypot(nx, ny) || 1;
  return {
    right: limbs(1),
    left: limbs(-1),
    head: [s.head[0], s.head[1], 0],
    crown: [nx / len, ny / len, 0],
    face: [-ny / len, nx / len, 0],
    bar: [s.bar[0], s.bar[1], 0],
    barHalf: def.barHalf ?? 60,
    plateR: def.plateRadius ?? 14,
  };
}

/** Every preset body, built once so the same pose is always the same object. */
export const BODIES = Object.fromEntries(
  Object.entries(LIFT_DEFS).map(([lift, def]) => [
    lift,
    { stand: buildBody(def, "stand"), half: buildBody(def, "half"), bottom: buildBody(def, "bottom") },
  ]),
) as Record<Lift, Record<Pose, Body>>;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function lerpLimbs(a: Limbs, b: Limbs, t: number): Limbs {
  const out = {} as Record<(typeof LIMB_KEYS)[number], Vec3>;
  for (const k of LIMB_KEYS) out[k] = lerp3(a[k], b[k], t);
  return out;
}

export function lerpBody(a: Body, b: Body, t: number): Body {
  return {
    right: lerpLimbs(a.right, b.right, t),
    left: lerpLimbs(a.left, b.left, t),
    head: lerp3(a.head, b.head, t),
    crown: lerp3(a.crown, b.crown, t),
    face: lerp3(a.face, b.face, t),
    bar: lerp3(a.bar, b.bar, t),
    barHalf: mix(a.barHalf, b.barHalf, t),
    plateR: mix(a.plateR, b.plateR, t),
  };
}

/* ---------- Camera ---------- */

/**
 * yaw: 0 looks at the figure's right side, 90 looks it in the face. pitch: how far above the camera is.
 * Both in degrees.
 */
export interface Camera {
  yaw: number;
  pitch: number;
}

const DEFAULT_CAMERAS: Record<View, Camera> = {
  // A little behind the right side, so the far arm and leg peek out behind the near ones.
  side: { yaw: -8, pitch: 8 },
  angle: { yaw: 45, pitch: 12 },
  front: { yaw: 90, pitch: 10 },
};

const CAMERAS = Object.fromEntries(
  Object.entries(LIFT_DEFS).map(([lift, def]) => [lift, { ...DEFAULT_CAMERAS, ...def.cameras }]),
) as Record<Lift, Record<View, Camera>>;

/** The preset camera for a view. The same object every time, so it can be compared with ===. */
export function cameraFor(lift: Lift, view: View): Camera {
  return CAMERAS[lift][view];
}

/** Turns the short way round. */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  const turn = ((((b.yaw - a.yaw) % 360) + 540) % 360) - 180;
  return { yaw: a.yaw + turn * t, pitch: mix(a.pitch, b.pitch, t) };
}

export interface Projected {
  x: number;
  y: number;
  /** Distance towards the camera. Bigger is nearer. */
  d: number;
}

/**
 * Orthographic projection that turns about the vertical line x = pivot, z = 0.
 * The camera tips down about the floor point x = tilt, which stays on the floor line.
 */
export function projector(cam: Camera, pivot = 110, tilt = pivot): (p: Vec3) => Projected {
  const yaw = cam.yaw * DEG;
  const pitch = cam.pitch * DEG;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Slide towards the middle of the frame as the camera comes round to the front.
  const shift = (CENTRE_X - pivot) * Math.abs(s);
  return ([x, y, z]) => {
    const dx = x - pivot;
    const toward = dx * s + z * c;
    const lift = ((x - tilt) * s + z * c) * sp;
    return { x: pivot + dx * c - z * s + shift, y: FLOOR + (y - FLOOR) * cp + lift, d: toward * cp - (y - FLOOR) * sp };
  };
}

/* ---------- Scene: what to draw, back to front ---------- */

/** far: 0 = near side, full ink; 1 = far side, muted. */
export type Part =
  | { kind: "seg"; a: Point; b: Point; w: number; far: number }
  | { kind: "poly"; pts: Point[]; w: number; far: number }
  | { kind: "dot"; c: Point; r: number; far: number; fill: "ink" | "bg" }
  | { kind: "plate"; c: Point; rx: number; ry: number; sleeve: boolean; far: number };

/** Body parts that are drawn together. Chains are drawn back to front; each gets a background halo. */
export interface Chain {
  key: string;
  depth: number;
  parts: Part[];
}

export type HighlightTone = "focus" | "flag";
export type Highlight =
  | { kind: "ring"; c: Point; r: number; tone: HighlightTone; label?: "L" | "R" }
  | { kind: "capsule"; a: Point; b: Point; r: number; tone: HighlightTone; label?: "L" | "R"; under?: boolean };

export interface Scene {
  viewBox: readonly [number, number, number, number];
  shadow: { c: Point; rx: number; ry: number };
  /** Bench pad and frame outlines, and its legs. Drawn before the figure. */
  bench?: { pad: Point[]; frame: Point[]; legs: [Point, Point][] };
  /** The bar's path over the whole rep. */
  path: Point[];
  chains: Chain[];
  highlights: Highlight[];
}

const avg = (...n: number[]) => n.reduce((a, b) => a + b, 0) / n.length;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const mid3 = (a: Vec3, b: Vec3): Vec3 => lerp3(a, b, 0.5);
const norm3 = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Convex hull (monotone chain) of a few projected points. */
function hull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}

function box(x: [number, number], y: [number, number], z: [number, number]): Vec3[] {
  const out: Vec3[] = [];
  for (const a of x) for (const b of y) for (const c of z) out.push([a, b, c]);
  return out;
}

const SIDED: ReadonlySet<BodyPart> = new Set(["shoulder", "elbow", "hand", "hip", "knee", "foot"]);
const RING_R: Partial<Record<BodyPart, number>> = { head: 16, shoulder: 9, elbow: 8, hand: 8, hip: 9, knee: 9, chest: 11 };

export interface SceneInput {
  lift: Lift;
  body: Body;
  camera: Camera;
  focus?: BodyPart;
  flag?: FigureFlag;
}

export function buildScene({ lift, body, camera, focus, flag }: SceneInput): Scene {
  const def = LIFT_DEFS[lift];
  const project = projector(camera, def.pivot, def.tilt);
  const pt = (v: Vec3): Point => {
    const p = project(v);
    return [p.x, p.y];
  };
  const depth = (v: Vec3) => project(v).d;
  const yaw = camera.yaw * DEG;
  const pitch = camera.pitch * DEG;
  const toCamera: Vec3 = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];

  const seg = (a: Vec3, b: Vec3, w: number, far: number): Part => ({ kind: "seg", a: pt(a), b: pt(b), w, far });
  const dot = (c: Vec3, r: number, far: number, fill: "ink" | "bg" = "ink"): Part => ({ kind: "dot", c: pt(c), r, far, fill });

  const chains: Chain[] = [];

  // Torso: a four-sided plate from hips to shoulders. Wide from the front, thin from the side.
  const { right: R, left: L } = body;
  const hipMid = mid3(R.hip, L.hip);
  const neckBase = mid3(R.shoulder, L.shoulder);
  const torsoDepth = avg(depth(hipMid), depth(neckBase)) + 6;
  chains.push({
    key: "torso",
    depth: torsoDepth,
    parts: [{ kind: "poly", pts: [L.hip, R.hip, R.shoulder, L.shoulder].map(pt), w: 12, far: 0 }],
  });

  // Seen from the right, the left side is far; seen from the front both sides are near.
  const farOf = (sign: 1 | -1) => clamp01(-sign * Math.cos(yaw));
  for (const [sign, limbs] of [
    [1, R],
    [-1, L],
  ] as const) {
    const far = farOf(sign);
    const name = sign > 0 ? "right" : "left";
    const near = far < 0.35;
    chains.push({
      key: `${name}-leg`,
      depth: avg(depth(limbs.ankle), depth(limbs.knee), depth(limbs.hip)) + 5,
      parts: [
        seg(limbs.heel, limbs.toe, 7, far),
        seg(limbs.ankle, limbs.knee, 9, far),
        seg(limbs.knee, limbs.hip, 11, far),
        ...(near ? [dot(limbs.knee, 1.8, 0, "bg")] : []),
      ],
    });
    chains.push({
      key: `${name}-arm`,
      depth: avg(depth(limbs.shoulder), depth(limbs.elbow), depth(limbs.hand)) + 4,
      parts: [
        seg(limbs.shoulder, limbs.elbow, 8, far),
        seg(limbs.elbow, limbs.hand, 7, far),
        dot(limbs.hand, 4.5, far),
        ...(near ? [dot(limbs.elbow, 1.6, 0, "bg")] : []),
      ],
    });
  }

  // Head, neck and the eyes that face the camera.
  const crown = norm3(body.crown);
  const face = norm3(body.face);
  const eyes: Part[] = [];
  for (const sign of [1, -1]) {
    const offset: Vec3 = [face[0] * 5 + crown[0] * 2, face[1] * 5 + crown[1] * 2, sign * 3.5];
    const n = norm3(offset);
    if (n[0] * toCamera[0] + n[1] * toCamera[1] + n[2] * toCamera[2] > 0.12)
      eyes.push(dot([body.head[0] + offset[0], body.head[1] + offset[1], offset[2]], 1.8, 0, "bg"));
  }
  chains.push({
    key: "head",
    depth: depth(body.head) + 11,
    parts: [seg(neckBase, lerp3(neckBase, body.head, 0.6), 7, 0), dot(body.head, 11, 0), ...eyes],
  });

  // The bar: centre piece between the hands, outer pieces to each end, and a plate near each end.
  const b = body.bar;
  const at = (z: number): Vec3 => [b[0], b[1], z];
  const H = body.barHalf;
  const gripL = L.hand[2];
  const gripR = R.hand[2];
  chains.push({
    key: "bar",
    // On a back squat the bar is behind the torso; on every other lift it is held in front of it.
    // (Sorting by centre depth alone gets this wrong when the camera looks down on a long torso.)
    depth: def.barOnBack
      ? torsoDepth - 0.5
      : Math.max(avg(depth(at(gripL)), depth(at(gripR))) + 2, torsoDepth + 0.5),
    parts: [seg(at(gripL), at(gripR), 3.5, 0)],
  });
  const plateFace = Math.abs(Math.cos(yaw));
  for (const sign of [1, -1] as const) {
    const end = at(sign * H);
    const grip = sign > 0 ? gripR : gripL;
    const far = farOf(sign);
    chains.push({
      key: `bar-${sign > 0 ? "right" : "left"}`,
      depth: avg(depth(at(grip)), depth(end)) + 2,
      parts: [seg(at(grip), end, 3.5, far)],
    });
    const plate = at(sign * (H - 6));
    chains.push({
      key: `plate-${sign > 0 ? "right" : "left"}`,
      depth: depth(plate) + 1,
      parts: [
        {
          kind: "plate",
          c: pt(plate),
          rx: Math.max(4, body.plateR * plateFace),
          ry: body.plateR * Math.cos(pitch),
          sleeve: plateFace > 0.35,
          far,
        },
      ],
    });
  }

  chains.sort((a, b) => a.depth - b.depth);

  // Bench: a padded box on a frame, with four legs.
  let bench: Scene["bench"];
  if (def.bench) {
    bench = {
      pad: hull(box([30, 134], [155, 162], [-15, 15]).map(pt)),
      frame: hull(box([28, 136], [160, 165], [-13, 13]).map(pt)),
      legs: [43, 121].flatMap((x) => [-10, 10].map((z): [Point, Point] => [pt([x, 165, z]), pt([x, FLOOR, z])])),
    };
  }

  const shadowX = def.shadow?.x ?? R.ankle[0] + 2;
  const shadowR = def.shadow?.r ?? 36;

  return {
    viewBox: [0, def.top ?? 0, VIEW_WIDTH, VIEW_BOTTOM - (def.top ?? 0)],
    shadow: { c: pt([shadowX, FLOOR, 0]), rx: shadowR, ry: Math.min(9, Math.max(3, shadowR * Math.sin(pitch))) },
    bench,
    path: (["stand", "half", "bottom"] as const).map((p) => pt([...def.poses[p].bar, 0])),
    chains,
    highlights: [
      ...(focus ? highlights(body, focus, undefined, "focus", pt) : []),
      ...(flag ? highlights(body, flag.part, flag.side, "flag", pt) : []),
    ],
  };
}

function highlights(
  body: Body,
  part: BodyPart,
  side: "left" | "right" | undefined,
  tone: HighlightTone,
  pt: (v: Vec3) => Point,
): Highlight[] {
  const hipMid = mid3(body.right.hip, body.left.hip);
  const neckBase = mid3(body.right.shoulder, body.left.shoulder);
  // Chest faces forward from the spine; the back is the opposite way.
  const spine: Vec3 = [neckBase[0] - hipMid[0], neckBase[1] - hipMid[1], 0];
  const front = norm3([-spine[1], spine[0], 0]);
  const along = (t: number, out: number): Vec3 => {
    const p = lerp3(hipMid, neckBase, t);
    return [p[0] + front[0] * out, p[1] + front[1] * out, 0];
  };

  if (part === "head") return [{ kind: "ring", c: pt(body.head), r: RING_R.head!, tone }];
  if (part === "chest") return [{ kind: "ring", c: pt(along(0.75, 6)), r: RING_R.chest!, tone }];
  // The back is drawn behind the body, so it shows as a glow along the spine.
  if (part === "back")
    return [{ kind: "capsule", a: pt(along(0.1, -7)), b: pt(along(0.9, -7)), r: 9, tone, under: true }];
  if (!SIDED.has(part)) return [];

  const signs = side === "left" ? [-1] : side === "right" ? [1] : [1, -1];
  return signs.map((sign): Highlight => {
    const limbs = sign > 0 ? body.right : body.left;
    const label = side ? (sign > 0 ? "R" : "L") : undefined;
    if (part === "foot") return { kind: "capsule", a: pt(limbs.heel), b: pt(limbs.toe), r: 7, tone, label };
    const joint = limbs[part as "shoulder" | "elbow" | "hand" | "hip" | "knee"];
    return { kind: "ring", c: pt(joint), r: RING_R[part]!, tone, label };
  });
}

/** Words for the pose, for screen readers. */
export function poseWords(lift: Lift, pose: Pose): string {
  return LIFT_DEFS[lift].words[pose];
}

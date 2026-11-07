// Tests for the 3D how-to figures (figure3d.ts). Pure maths, no browser and no rendering.
// Run from the repo root:  node --test "web/src/components/declarative/*.test.mjs"

import { test } from "node:test";
import assert from "node:assert/strict";
import { BODIES, LIFT_DEFS, buildScene, cameraFor, lerpCamera, projector } from "./figure3d.ts";
import { BODY_PARTS, LIFTS, POSES, VIEWS } from "./schema.ts";

/** Every drawn point of a scene, grown by its stroke or radius, as [minX, minY, maxX, maxY] boxes. */
function extents(scene) {
  const boxes = [];
  const add = (p, r) => boxes.push([p[0] - r, p[1] - r, p[0] + r, p[1] + r]);
  for (const chain of scene.chains)
    for (const part of chain.parts) {
      if (part.kind === "seg") [part.a, part.b].forEach((p) => add(p, part.w / 2));
      if (part.kind === "poly") part.pts.forEach((p) => add(p, part.w / 2));
      if (part.kind === "dot") add(part.c, part.r);
      if (part.kind === "plate")
        boxes.push([part.c[0] - part.rx - 1, part.c[1] - part.ry - 1, part.c[0] + part.rx + 1, part.c[1] + part.ry + 1]);
    }
  for (const h of scene.highlights) (h.kind === "ring" ? [h.c] : [h.a, h.b]).forEach((p) => add(p, h.r + 1));
  return boxes;
}

const chainIndex = (scene, key) => scene.chains.findIndex((c) => c.key === key);
const findPart = (scene, key, i = 0) => scene.chains.find((c) => c.key === key).parts[i];

test("every lift, pose and view stays inside the frame", () => {
  for (const lift of LIFTS)
    for (const pose of POSES)
      for (const view of VIEWS) {
        const scene = buildScene({ lift, body: BODIES[lift][pose], camera: cameraFor(lift, view), focus: "knee" });
        const [x0, y0, w, h] = scene.viewBox;
        for (const [a, b, c, d] of extents(scene)) {
          const where = `${lift} ${pose} ${view}`;
          assert.ok(a >= x0 && c <= x0 + w, `${where}: x ${a.toFixed(1)}..${c.toFixed(1)} is outside the frame`);
          assert.ok(b >= y0 && d <= y0 + h, `${where}: y ${b.toFixed(1)}..${d.toFixed(1)} is outside the frame`);
        }
      }
});

test("every body part can be ringed on every lift", () => {
  for (const lift of LIFTS)
    for (const part of BODY_PARTS) {
      const scene = buildScene({ lift, body: BODIES[lift].half, camera: cameraFor(lift, "front"), focus: part });
      assert.ok(scene.highlights.length >= 1, `${lift} ${part}`);
      for (const h of scene.highlights) assert.equal(h.tone, "focus");
    }
});

test("the side view still matches the flat drawing it replaced", () => {
  // The old figure had the near ankle at (110, 192) and the head of a standing squat at (114, 38).
  const project = projector(cameraFor("squat", "side"));
  const body = BODIES.squat.stand;
  const ankle = project(body.right.ankle);
  const head = project(body.head);
  assert.ok(Math.abs(ankle.x - 110) < 4 && Math.abs(ankle.y - 192) < 4, `ankle at ${ankle.x}, ${ankle.y}`);
  assert.ok(Math.abs(head.x - 114) < 4 && Math.abs(head.y - 38) < 4, `head at ${head.x}, ${head.y}`);
});

test("from the side the figure's right is near; from the front its left is on the screen's right", () => {
  const side = buildScene({ lift: "squat", body: BODIES.squat.stand, camera: cameraFor("squat", "side") });
  assert.ok(chainIndex(side, "right-leg") > chainIndex(side, "left-leg"), "near leg is drawn last");
  assert.equal(findPart(side, "right-leg").far, 0);
  assert.equal(findPart(side, "left-leg").far > 0.9, true);

  const project = projector(cameraFor("squat", "front"));
  const body = BODIES.squat.stand;
  assert.ok(project(body.left.shoulder).x > project(body.right.shoulder).x, "mirror view");
  const front = buildScene({ lift: "squat", body, camera: cameraFor("squat", "front") });
  assert.ok(findPart(front, "left-leg").far < 0.01 && findPart(front, "right-leg").far < 0.01, "both sides in full ink");
});

test("knees track out over the toes as the squat gets deeper", () => {
  const kneeOut = (pose) => BODIES.squat[pose].right.knee[2] - BODIES.squat[pose].right.ankle[2];
  assert.ok(kneeOut("bottom") > kneeOut("half") && kneeOut("half") > kneeOut("stand"));
  assert.ok(kneeOut("bottom") > 8);
});

test("the bar is behind the torso on a back squat and in front of it on a deadlift", () => {
  const front = (lift, pose) => buildScene({ lift, body: BODIES[lift][pose], camera: cameraFor(lift, "front") });
  for (const pose of POSES) {
    const squat = front("squat", pose);
    assert.ok(chainIndex(squat, "bar") < chainIndex(squat, "torso"), `squat ${pose}`);
    const deadlift = front("deadlift", pose);
    assert.ok(chainIndex(deadlift, "bar") > chainIndex(deadlift, "torso"), `deadlift ${pose}`);
  }
});

test("a flag with a side rings one joint and labels it; without a side it rings both", () => {
  const scene = (flag) =>
    buildScene({ lift: "bench", body: BODIES.bench.bottom, camera: cameraFor("bench", "front"), flag });
  const one = scene({ part: "shoulder", side: "left" }).highlights;
  assert.equal(one.length, 1);
  assert.equal(one[0].tone, "flag");
  assert.equal(one[0].label, "L");
  const both = scene({ part: "shoulder" }).highlights;
  assert.equal(both.length, 2);
  assert.ok(both.every((h) => h.label === undefined));
  // A side on a part in the middle of the body is ignored.
  assert.equal(scene({ part: "chest", side: "left" }).highlights.length, 1);
});

test("the camera turns the short way round", () => {
  assert.equal(lerpCamera({ yaw: 170, pitch: 0 }, { yaw: -170, pitch: 10 }, 0.5).yaw, 180);
  assert.equal(lerpCamera({ yaw: -8, pitch: 8 }, { yaw: 90, pitch: 10 }, 1).yaw, 90);
});

test("presets are stable objects and every lift has every view", () => {
  for (const lift of LIFTS) {
    assert.ok(LIFT_DEFS[lift]);
    for (const view of VIEWS) assert.equal(cameraFor(lift, view), cameraFor(lift, view));
    for (const pose of POSES) assert.equal(BODIES[lift][pose], BODIES[lift][pose]);
  }
});

test("dragging all the way round never produces a broken drawing", () => {
  for (const lift of LIFTS)
    for (let yaw = -180; yaw <= 180; yaw += 15) {
      const scene = buildScene({ lift, body: BODIES[lift].half, camera: { yaw, pitch: 10 } });
      for (const box of extents(scene)) assert.ok(box.every(Number.isFinite), `${lift} at ${yaw}`);
    }
});

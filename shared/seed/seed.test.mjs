// Seed data checks. Run with `npm test` (or `yarn workspace @pt-coach/seed test`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = async (file) => JSON.parse(await readFile(path.join(here, file), "utf8"));

const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateExercises = ajv.compile(await load("exercises.schema.json"));
const validateClients = ajv.compile(await load("clients.schema.json"));

const exercises = await load("exercises.json");
const clients = await load("clients.json");

const PATTERNS = [
  "squat",
  "hinge",
  "lunge",
  "horizontal-push",
  "vertical-push",
  "horizontal-pull",
  "vertical-pull",
  "carry",
  "core",
  "isolation",
];
const MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
];
const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "bodyweight",
  "band",
  "trap-bar",
];

// id -> required shoulderStress (from CONTRACTS.md section 2). Null means no value is fixed.
const REQUIRED = {
  "back-squat": null,
  "goblet-squat": null,
  "trap-bar-deadlift": null,
  "romanian-deadlift": null,
  "split-squat": null,
  "hip-thrust": null,
  "bench-press": "medium",
  "overhead-press": "high",
  "landmine-press": "medium",
  "dumbbell-floor-press": "low",
  "push-up": "medium",
  "barbell-row": null,
  "chest-supported-row": "low",
  "lat-pulldown": null,
  "face-pull": "low",
  "plank": null,
  "dead-bug": null,
  "farmer-carry": null,
};

const byId = new Map(exercises.map((e) => [e.id, e]));
const isLowOrMedium = (e) => e.shoulderStress === "low" || e.shoulderStress === "medium";
const hasShoulderInjury = (c) => c.injuries.some((i) => i.area === "shoulder");

test("exercises.json validates against exercises.schema.json", () => {
  assert.ok(validateExercises(exercises), JSON.stringify(validateExercises.errors, null, 2));
});

test("clients.json validates against clients.schema.json", () => {
  assert.ok(validateClients(clients), JSON.stringify(validateClients.errors, null, 2));
});

test("library is about 40 exercises and covers every pattern, muscle and equipment type", () => {
  assert.ok(exercises.length >= 35 && exercises.length <= 45, `count is ${exercises.length}`);
  for (const p of PATTERNS) {
    assert.ok(exercises.some((e) => e.pattern === p), `no exercise with pattern ${p}`);
  }
  for (const m of MUSCLES) {
    assert.ok(exercises.some((e) => e.muscles.includes(m)), `no exercise for muscle ${m}`);
  }
  for (const eq of EQUIPMENT) {
    assert.ok(exercises.some((e) => e.equipment.includes(eq)), `no exercise using ${eq}`);
  }
});

test("exercise ids are unique", () => {
  const ids = exercises.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate exercise id");
});

test("client ids are unique", () => {
  const ids = clients.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate client id");
});

test("every required exercise id is present with its required shoulderStress", () => {
  for (const [id, stress] of Object.entries(REQUIRED)) {
    const ex = byId.get(id);
    assert.ok(ex, `missing required exercise ${id}`);
    if (stress !== null) {
      assert.equal(ex.shoulderStress, stress, `${id} should be ${stress}`);
    }
  }
});

test("every vertical-push and every high shoulderStress exercise has a low or medium alternative", () => {
  const targets = exercises.filter((e) => e.pattern === "vertical-push" || e.shoulderStress === "high");
  assert.ok(targets.length > 0);
  for (const ex of targets) {
    const alternative = exercises.some(
      (other) =>
        other.id !== ex.id &&
        isLowOrMedium(other) &&
        (other.pattern === ex.pattern || other.muscles[0] === ex.muscles[0]),
    );
    assert.ok(alternative, `${ex.id} has no low or medium alternative (same pattern or primary muscle)`);
  }
});

for (const client of clients) {
  test(`${client.id} can get a sensible 3 day program from the library`, () => {
    const lowOnly = hasShoulderInjury(client);
    // Only exercises whose equipment the client has (every listed item is in client.equipment).
    const usable = exercises.filter(
      (e) =>
        e.equipment.every((eq) => client.equipment.includes(eq)) &&
        (!lowOnly || isLowOrMedium(e)),
    );
    const need = [
      ["squat or lunge", (e) => e.pattern === "squat" || e.pattern === "lunge"],
      ["hinge", (e) => e.pattern === "hinge"],
      ["horizontal push", (e) => e.pattern === "horizontal-push"],
      ["horizontal pull", (e) => e.pattern === "horizontal-pull"],
      ["core", (e) => e.pattern === "core"],
    ];
    for (const [label, match] of need) {
      const found = usable.filter(match);
      assert.ok(
        found.length > 0,
        `${client.id}: no ${label} exercise with their equipment${lowOnly ? " at low or medium stress" : ""}`,
      );
    }
  });
}

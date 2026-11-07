import { expect, test } from "@playwright/test";

const RUN_URL = /\/api\/copilotkit\/agent\/[^/]+\/run/;
const PROMPT =
  "4 week strength block for Sarah, 3 days a week, sore left shoulder. She wants overhead press in there.";

test("demo script against the replay model", async ({ page }) => {
  const errors: string[] = [];
  const runErrors: string[] = [];
  let inFlight = 0;

  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("request", (r) => {
    if (RUN_URL.test(r.url())) inFlight++;
  });
  page.on("requestfailed", (r) => {
    if (RUN_URL.test(r.url())) inFlight--;
  });
  page.on("response", async (r) => {
    if (!RUN_URL.test(r.url())) return;
    try {
      const body = await r.text();
      const i = body.indexOf("RUN_ERROR");
      if (i >= 0) runErrors.push(body.slice(i, i + 300));
    } catch {
      /* body unavailable */
    }
    inFlight--;
  });

  const chat = page.locator('[data-testid="chat"]');
  const cells = page.locator('[data-testid="grid-cell"]');
  const weekCells = (week: number) => page.locator(`[data-testid="grid-cell"][data-week="${week}"]`);
  const weekDays = (week: number) => page.locator(`[data-testid="grid-day"][data-week="${week}"]`);
  const dayLabels = (week: number) =>
    weekDays(week).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.day));

  const cellCounts = new Set<number>();
  let sawAgentTouched = false;
  const sample = async () => {
    cellCounts.add(await cells.count());
    if (!sawAgentTouched) {
      sawAgentTouched =
        (await page.locator('[data-testid="grid-cell"][data-agent-touched="true"]').count()) > 0;
    }
  };

  const send = async (text: string) => {
    const input = chat.locator("textarea").first();
    await input.fill(text);
    await input.press("Enter");
  };

  // Idle = no agent run in flight for 4 s (a run may be followed by an automatic follow-up run).
  async function waitIdle() {
    await page.waitForTimeout(1500);
    let quiet = 0;
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(500);
      await sample();
      quiet = inFlight === 0 ? quiet + 1 : 0;
      if (quiet >= 8) return;
    }
    throw new Error("Timed out waiting for the agent to go idle");
  }

  // 1. Load, pick model and client
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('[data-testid="model-select"]').selectOption("replay");
  await page.locator('[data-testid="client-select"]').selectOption("sarah");
  await expect(page.locator('[data-testid="active-model"]')).toContainText("Replay");

  // 2. Ask for the block
  await send(PROMPT);

  // 3. Approve the swap (sample the grid while we wait so progressive building is observed)
  const swap = chat.locator('[data-testid="swap-approval"]').first();
  await expect
    .poll(async () => {
      await sample();
      return swap.getAttribute("data-state");
    }, { timeout: 120_000 })
    .toBe("pending");
  await swap.locator('[data-testid="swap-approve"]').click();
  await expect(swap).toHaveAttribute("data-state", "approved");

  // 4. Build finishes
  await waitIdle();
  await expect(page.locator('[data-testid="grid-week-tab"]')).toHaveCount(4);
  await page.locator('[data-testid="grid-week-tab"][data-week="1"]').click();
  await expect(weekDays(1)).toHaveCount(3);
  const days = await dayLabels(1);
  expect(new Set(days).size).toBe(3);
  const ids = await weekCells(1).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.exerciseId));
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.every((id) => !!id)).toBe(true);
  await expect(page.locator('[data-testid="grid-cell"][data-exercise-id="overhead-press"]')).toHaveCount(0);
  await expect(chat.locator('[data-testid="week-summary"][data-state="done"]').first()).toBeVisible();
  expect(cellCounts.size, `cells should appear progressively, saw counts ${[...cellCounts]}`).toBeGreaterThan(2);
  expect(sawAgentTouched, "some cell should have been agent-touched").toBe(true);

  // 5. Trainer edit: change sets, then drag day 1 onto day 2
  const first = weekCells(1).first();
  const firstExercise = await first.getAttribute("data-exercise-id");
  const sets = first.locator('[data-field="sets"]');
  const newSets = (await sets.inputValue()) === "5" ? "4" : "5";
  await sets.fill(newSets);
  await sets.blur();
  await expect(sets).toHaveValue(newSets);

  await weekDays(1).nth(0).dragTo(weekDays(1).nth(1));
  // labels keep their order, content moves
  await expect
    .poll(() =>
      weekCells(1).evaluateAll(
        (els, args) =>
          els.some(
            (e) =>
              (e as HTMLElement).dataset.exerciseId === args.ex && (e as HTMLElement).dataset.day === args.day,
          ),
        { ex: firstExercise, day: days[1] },
      ),
    )
    .toBe(true);
  expect(await dayLabels(1)).toEqual(days);

  // 6. Rebalance around the edits
  await send("I edited week 1. Rebalance week 1 around my edits.");
  await waitIdle();
  expect(runErrors).toEqual([]);
  await expect(page.locator('[data-testid="grid-week-tab"]')).toHaveCount(4);

  // 7. Show Monday
  await send("Show me Monday of week 1.");
  await expect(chat.locator('[data-testid="exercise-card"][data-state="done"]').first()).toBeVisible({
    timeout: 120_000,
  });
  await waitIdle();

  // 8. No errors anywhere
  expect(errors, errors.join("\n")).toEqual([]);
  expect(runErrors, runErrors.join("\n")).toEqual([]);
});

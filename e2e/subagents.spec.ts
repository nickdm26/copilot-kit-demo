import { expect, test } from "@playwright/test";

// Parallel sub-agents (CONTRACTS section 11) against the replay model's parallel recording.
const RUN_URL = /\/api\/copilotkit\/agent\/[^/]+\/run/;
const PROMPT = "4 week strength block for Sarah, 3 days a week, sore left shoulder. She wants overhead press in there.";

test("parallel sub-agents build the block side by side", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const runErrors: string[] = [];
  const subagentEvents: string[] = [];
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
      subagentEvents.push(...(body.match(/"type":"SUBAGENT_[A-Z]+"/g) ?? []));
    } catch {
      /* body unavailable */
    }
    inFlight--;
  });

  const chat = page.locator('[data-testid="chat"]');
  const boards = chat.locator('[data-testid="subagent-board"]');
  const send = async (text: string) => {
    const input = chat.locator("textarea").first();
    await input.fill(text);
    await input.press("Enter");
  };
  async function waitIdle() {
    await page.waitForTimeout(1500);
    let quiet = 0;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(500);
      quiet = inFlight === 0 ? quiet + 1 : 0;
      if (quiet >= 6) return;
    }
    throw new Error("Timed out waiting for the agent to go idle");
  }

  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('[data-testid="model-select"]').selectOption("replay");
  await page.locator('[data-testid="client-select"]').selectOption("sarah");
  const toggle = page.locator('[data-testid="subagents-toggle"]');
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await send(PROMPT);

  // Week 1: three day-builders and an injury screen, on one board, running at the same time.
  const week1 = boards.first();
  await expect(week1).toBeVisible({ timeout: 60_000 });
  await expect(week1).toHaveAttribute("data-count", "4");
  await expect
    .poll(() => week1.locator('[data-testid="subagent-lane"][data-status="running"]').count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
  // The grid fills while they run: more than one day of week 1 appears before the board is done.
  await expect
    .poll(async () => (await week1.getAttribute("data-state")) === "running" &&
      (await page.locator('[data-testid="grid-day"][data-week="1"]').count()) >= 2, { timeout: 30_000 })
    .toBe(true);
  await expect(week1).toHaveAttribute("data-state", "done", { timeout: 30_000 });
  await expect(week1.locator('[data-testid="subagent-lane"][data-status="done"]')).toHaveCount(4);
  await expect(week1.locator('[data-testid="subagent-lane"][data-kind="injury-screen"]')).toHaveCount(1);

  // A lane opens to show its brief and tool calls.
  const wed = week1.locator('[data-testid="subagent-lane"]', { hasText: "Wed" });
  await wed.locator("button").first().click();
  await expect(wed).toContainText("Brief");
  await expect(wed).toContainText("searchExercises");
  await expect(wed).toContainText("writeDay");

  // The sub-agents' own messages stay out of the transcript (their briefs are not trainer messages).
  await expect(chat.getByText("Squat-led lower day: back squat as the main lift", { exact: false })).toHaveCount(0);

  // The overhead press they wrote is flagged and goes to the trainer.
  const swap = chat.locator('[data-testid="swap-approval"]').first();
  await expect(swap).toHaveAttribute("data-state", "pending", { timeout: 30_000 });
  await swap.locator('[data-testid="swap-approve"]').click();

  // Weeks 2 to 4: a second board with three week-builders.
  await expect(boards).toHaveCount(2, { timeout: 60_000 });
  const later = boards.nth(1);
  await expect(later).toHaveAttribute("data-count", "3");
  await expect(later).toHaveAttribute("data-state", "done", { timeout: 60_000 });
  await expect(later.locator('[data-testid="subagent-lane"][data-kind="build-week"][data-status="done"]')).toHaveCount(3);

  await waitIdle();
  await expect(page.locator('[data-testid="grid-week-tab"]')).toHaveCount(4);
  for (const week of [1, 2, 3, 4]) {
    await page.locator(`[data-testid="grid-week-tab"][data-week="${week}"]`).click();
    await expect(page.locator(`[data-testid="grid-day"][data-week="${week}"]`)).toHaveCount(3);
  }
  await expect(page.locator('[data-testid="grid-cell"][data-exercise-id="overhead-press"]')).toHaveCount(0);
  await expect(chat.locator('[data-testid="week-summary"][data-state="done"]').first()).toBeVisible();

  // On the wire: 7 sub-agents, each started and finished.
  expect(subagentEvents.filter((e) => e.includes("STARTED"))).toHaveLength(7);
  expect(subagentEvents.filter((e) => e.includes("FINISHED"))).toHaveLength(7);
  expect(errors, errors.join("\n")).toEqual([]);
  expect(runErrors, runErrors.join("\n")).toEqual([]);
});

test("the toggle starts off and ?subagents turns it on", async ({ page }) => {
  // The toggle is remembered per browser; a fresh context starts with it off.
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator('[data-testid="subagents-toggle"]')).toHaveAttribute("aria-checked", "false");
  await page.goto("/?subagents", { waitUntil: "networkidle" });
  await expect(page.locator('[data-testid="subagents-toggle"]')).toHaveAttribute("aria-checked", "true");
});

import { expect, test } from "@playwright/test";

// Regression: on mobile only the active tab used to render, so opening Program mounted a fresh grid that reset the
// agent's program to empty. Runs against the replay model (like demo.spec.ts).

const PROMPT =
  "4 week strength block for Sarah, 3 days a week, sore left shoulder. She wants overhead press in there.";

test("a program built on mobile survives tab switching and a layout change", async ({ page }) => {
  test.setTimeout(90_000);

  // Pick the model and client with the pickers in the mobile header.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('[data-testid="model-select"]').selectOption("replay");
  await page.locator('[data-testid="client-select"]').selectOption("sarah");
  await expect(page.locator('[data-testid="model-select"]')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[data-testid="client-select"]')).toBeInViewport({ ratio: 1 });
  await page.getByRole("tab", { name: "Coach" }).click();
  await expect(page.locator('[data-testid="active-model"]')).toContainText("Replay");
  await page.getByRole("tab", { name: "Program" }).click();

  const chat = page.locator('[data-testid="chat"]');
  const cells = page.locator('[data-testid="grid-cell"]');
  const weekTabs = page.locator('[data-testid="grid-week-tab"]');

  // Ask for the block on the Coach tab and approve the swap, then leave for Program while it builds.
  await page.getByRole("tab", { name: "Coach" }).click();
  const input = chat.locator("textarea").first();
  await input.fill(PROMPT);
  await input.press("Enter");
  const swap = chat.locator('[data-testid="swap-approval"]').first();
  await expect.poll(() => swap.getAttribute("data-state"), { timeout: 60_000 }).toBe("pending");
  await swap.locator('[data-testid="swap-approve"]').click();
  await expect(swap).toHaveAttribute("data-state", "approved");
  await page.getByRole("tab", { name: "Program" }).click();

  // The program fills in on the Program tab.
  await expect(weekTabs).toHaveCount(4, { timeout: 60_000 });
  await expect.poll(() => cells.count()).toBeGreaterThan(0);
  const built = await cells.count();

  // Switching tabs back and forth keeps the program, and the chat keeps its history.
  for (const name of ["Client", "Coach", "Program"]) {
    await page.getByRole("tab", { name }).click();
  }
  await expect(weekTabs).toHaveCount(4);
  await expect(cells).toHaveCount(built);
  await page.getByRole("tab", { name: "Coach" }).click();
  await expect(swap).toHaveAttribute("data-state", "approved");
  await page.getByRole("tab", { name: "Program" }).click();

  // Crossing the breakpoint remounts the grid; the program must survive that too.
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(weekTabs).toHaveCount(4);
  await expect(cells).toHaveCount(built);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(weekTabs).toHaveCount(4);
  await expect(cells).toHaveCount(built);
});

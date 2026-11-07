import { expect, test, type Page } from "@playwright/test";

// Layout regression: a long conversation must scroll inside the chat, never the page.
// No agent run needed: we stretch the chat's own message scroller with a tall spacer.

const VIEWPORTS = [
  { name: "desktop", width: 1400, height: 900 },
  { name: "tablet", width: 900, height: 700 },
  { name: "mobile", width: 390, height: 800 },
] as const;

async function openChat(page: Page, name: string) {
  await page.goto("/", { waitUntil: "networkidle" });
  if (name === "mobile") await page.getByRole("tab", { name: "Coach" }).click();
  await page.locator('[data-testid="chat"] textarea').first().waitFor();
}

// The message list is the tallest scrollable element inside the chat panel that fits in the panel. (A scrollable
// element taller than the panel is sized to its content, e.g. a list inside the real scroller, so it isn't the one.)
async function stretchMessageScroller(page: Page) {
  return page.evaluate(() => {
    const chat = document.querySelector('[data-testid="chat"]')!;
    const panelHeight = chat.clientHeight;
    let best: HTMLElement | null = null;
    chat.querySelectorAll<HTMLElement>("*").forEach((el) => {
      if (el.tagName === "TEXTAREA" || !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return;
      if (el.clientHeight > panelHeight) return;
      if (!best || el.clientHeight > best.clientHeight) best = el;
    });
    if (!best) return false;
    const spacer = document.createElement("div");
    spacer.setAttribute("data-testid", "layout-test-spacer");
    spacer.style.height = "5000px";
    (best as HTMLElement).appendChild(spacer);
    (best as HTMLElement).setAttribute("data-layout-scroller", "");
    return true;
  });
}

for (const vp of VIEWPORTS) {
  test(`long chat scrolls inside the chat, not the page (${vp.name} ${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openChat(page, vp.name);

    expect(await stretchMessageScroller(page), "chat has a scrollable message list").toBe(true);

    const scroller = page.locator("[data-layout-scroller]");
    const input = page.locator('[data-testid="chat"] textarea').first();

    // The page itself must not grow or scroll.
    const metrics = await page.evaluate(() => ({
      docHeight: document.documentElement.scrollHeight,
      bodyHeight: document.body.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(metrics.docHeight).toBeLessThanOrEqual(metrics.innerHeight);
    expect(metrics.bodyHeight).toBeLessThanOrEqual(metrics.innerHeight);

    // The message list is the thing that scrolls.
    const sizes = await scroller.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // The input stays on screen while the list is scrolled.
    await expect(input).toBeInViewport();
    const box = (await page.locator('[data-testid="chat"]').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  });
}

test("desktop: the program grid and chat scroll independently", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openChat(page, "desktop");
  const overflow = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="program-grid"]') as HTMLElement | null;
    return grid ? getComputedStyle(grid).overflowY : null;
  });
  expect(overflow).toBe("auto");
});

test.describe("mobile tabs (390x800)", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the tab bar stays visible on every tab, Coach included, and only the active panel shows", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const tabBar = page.getByRole("tablist", { name: "Main navigation" });

    for (const name of ["Program", "Coach", "Client", "Coach", "Program"]) {
      await page.getByRole("tab", { name }).click();
      await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
      await expect(tabBar).toBeInViewport();

      const id = name.toLowerCase();
      for (const other of ["program", "coach", "client"]) {
        const panel = page.locator(`[data-testid="mobile-panel-${other}"]`);
        if (other === id) await expect(panel).toBeVisible();
        else await expect(panel).toBeHidden();
      }
    }
  });

  test("the model and client pickers are usable on every tab", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const model = page.locator('[data-testid="model-select"]');
    const client = page.locator('[data-testid="client-select"]');
    for (const name of ["Program", "Coach", "Client"]) {
      await page.getByRole("tab", { name }).click();
      for (const picker of [model, client]) {
        await expect(picker).toBeVisible();
        const box = (await picker.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, "picker fits inside the phone width").toBeLessThanOrEqual(390);
      }
    }
    await model.selectOption("replay");
    await page.getByRole("tab", { name: "Coach" }).click();
    await expect(page.locator('[data-testid="active-model"]')).toContainText("Replay");
  });

  test("the chat stays mounted while another tab is showing", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Coach" }).click();
    const input = page.locator('[data-testid="chat"] textarea').first();
    await input.fill("half-written message");

    await page.getByRole("tab", { name: "Client" }).click();
    await page.getByRole("tab", { name: "Program" }).click();
    await page.getByRole("tab", { name: "Coach" }).click();

    await expect(input).toHaveValue("half-written message");
  });
});

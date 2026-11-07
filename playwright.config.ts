import { defineConfig } from "@playwright/test";

// BASE_URL is the web app URL printed by `aspire run` (no ports are hard-coded).
const baseURL = process.env.BASE_URL;
if (!baseURL) {
  throw new Error(
    'BASE_URL is not set. Run `aspire run`, then set BASE_URL to the web URL, e.g. $env:BASE_URL="<web url>"; npx playwright test',
  );
}

export default defineConfig({
  testDir: "./e2e",
  // Fail fast. Specs that drive an agent run (demo, mobile) raise their own test timeout.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    viewport: { width: 1400, height: 900 },
    // Without these a click on a missing element waits for the whole test timeout.
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});

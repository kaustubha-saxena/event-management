import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("homepage presents the CampusFlow foundation and honest service status", async ({ page }) => {
  const pageErrors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));
  await page.goto("/");
  await expect(page).toHaveTitle(/CampusFlow/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("showing up");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.locator("#page-status")).toContainText("needs Firebase and Supabase configuration");
  await expect(page.getByRole("button", { name: /Sign in/ })).toBeDisabled();
  await expect(page.getByLabel("Search events")).toBeDisabled();
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(503);
  expect(await health.json()).toMatchObject({ status: "not_configured" });
  await page.screenshot({ path: "report/screenshots/stage1-homepage.png", fullPage: true });
});

test("page reflows at phone and tablet widths without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noOverflow, `horizontal overflow at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "report/screenshots/stage1-mobile.png", fullPage: true });
});

test("skip link and accessibility scan", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

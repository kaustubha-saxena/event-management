import { test, expect } from "@playwright/test";
async function login(page, email) {
  await page.getByRole("button", { name: "Sign in", exact: false }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password (required)").fill("CampusDemo!2026");
  await page
    .locator("#auth-form")
    .getByRole("button", { name: "Sign in" })
    .click();
  await expect(page.locator("dialog")).not.toBeVisible();
}
test("Student discovery, persistence, registration, cancellation and screenshots", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".event-card")).toHaveCount(6);
  await page.screenshot({
    path: "report/screenshots/01-home-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Creative", exact: false })
    .first()
    .click();
  await expect(page.locator(".event-card")).toHaveCount(2);
  await page.getByRole("button", { name: "All events", exact: true }).click();
  await page.getByLabel("Search events").fill("brilliant");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page.getByLabel("Search events").fill("");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(6);
  await login(page, "student@campus.test");
  await page.locator(".save-button").first().click();
  await page.getByRole("button", { name: "Saved events", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Saved events", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page
    .locator(".event-card")
    .first()
    .getByRole("button", { name: "View event" })
    .click();
  await expect(page.locator("#book-event")).toBeVisible();
  await page.screenshot({ path: "report/screenshots/02-event-detail.png" });
  await page.locator("#book-event").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "My registrations", exact: true })
    .click();
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page.screenshot({ path: "report/screenshots/03-my-registrations.png" });
  await page.getByRole("button", { name: "View event" }).click();
  await page
    .getByRole("button", { name: "Cancel registration", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".empty")).toBeVisible();
  await page.getByRole("button", { name: "Saved events", exact: true }).click();
  await page.locator(".save-button").click();
  await expect(page.locator(".empty")).toBeVisible();
  expect(errors).toEqual([]);
});
test("Organizer creates, edits, views attendees and deletes an event", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, "organizer@campus.test");
  await page.getByRole("button", { name: "Organizer", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(6);
  await page.screenshot({ path: "report/screenshots/04-organizer.png" });
  await page.getByRole("button", { name: "Create event" }).click();
  await page.getByLabel("Event title").fill("Browser test workshop");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A practical workshop created during the browser integration test.");
  await page.getByLabel("Venue", { exact: true }).fill("Learning Studio");
  await page.getByLabel("Date and time").fill("2099-10-26T14:00");
  await page.screenshot({ path: "report/screenshots/05-create-event.png" });
  await page.getByRole("button", { name: "Publish event" }).click();
  await expect(page.locator(".event-card")).toHaveCount(7);
  const card = page
    .locator(".event-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Browser test workshop",
        exact: true,
      }),
    });
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Event title").fill("Edited browser workshop");
  await page.getByRole("button", { name: "Save changes" }).click();
  const edited = page
    .locator(".event-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Edited browser workshop",
        exact: true,
      }),
    });
  await expect(edited).toBeVisible();
  await edited.getByRole("button", { name: "Attendees" }).click();
  await expect(page.getByText("No registrations yet.")).toBeVisible();
  await page.keyboard.press("Escape");
  await edited.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(6);
});
test("Mobile layout and keyboard dialog access", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".event-card")).toHaveCount(6);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "report/screenshots/06-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Tab");
  await expect(page.getByText("Skip to main content")).toBeFocused();
  await page.getByRole("button", { name: "Sign in", exact: false }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
});
test("Automated accessibility checks on home and sign-in", async ({ page }) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await page.goto("/");
  await expect(page.locator(".event-card")).toHaveCount(6);
  let scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.getByRole("button", { name: "Sign in", exact: false }).click();
  scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
});

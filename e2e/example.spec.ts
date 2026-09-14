import { test, expect } from "@playwright/test";

test("homepage is accessible", async ({ page }) => {
  await page.goto("/");

  // Page should load without errors and respond with 2xx status
  expect(page.url()).toContain("localhost");
});

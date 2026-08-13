import { test, expect } from "@playwright/test";

test("new user can sign up and sign in to access their pantry", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "Test1234!";

  await page.goto("/auth/signup");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Registration successful" })).toBeVisible();

  await page.getByRole("link", { name: "Go to sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "My Pantry" })).toBeVisible();

  // No account-deletion UI exists, so cleanup relies on the timestamped
  // email above to avoid collisions across runs.
});

test.describe("unauthenticated access to protected routes", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated requests to protected routes are redirected or rejected", async ({ page, request }) => {
    // Page route: middleware redirects to sign-in.
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    // Fetch-driven API route: handler returns 401 instead of redirecting.
    const response = await request.post("/api/shopping-list-items/00000000-0000-0000-0000-000000000000/checkoff", {
      form: { qty_purchased: "1" },
    });
    expect(response.status()).toBe(401);
  });
});

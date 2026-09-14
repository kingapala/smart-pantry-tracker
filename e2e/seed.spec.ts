import { test, expect } from "@playwright/test";

test("sign up page loads and form is interactive", async ({ page }) => {
  await page.goto("/auth/signup");

  // Verify signup page is loaded
  await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();

  // Verify form fields are present and interactive
  const emailField = page.getByLabel("Email");
  const passwordField = page.getByLabel("Password", { exact: true });
  const confirmPasswordField = page.getByLabel("Confirm password");
  const createButton = page.getByRole("button", { name: "Create account" });

  await expect(emailField).toBeVisible();
  await expect(passwordField).toBeVisible();
  await expect(confirmPasswordField).toBeVisible();
  await expect(createButton).toBeVisible();

  // Test that we can interact with the form - fill in each field
  await emailField.fill("test@example.com");
  await passwordField.fill("Test1234!");
  await confirmPasswordField.fill("Test1234!");

  // Verify button is clickable and enabled
  await expect(createButton).toBeEnabled();
  await expect(createButton).toBeVisible();

  // Verify link to signin page exists
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test.describe("unauthenticated access to protected routes", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated requests to protected routes are redirected or rejected", async ({ page, request }) => {
    // Page route: middleware redirects to sign-in.
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    // Fetch-driven API route: handler rejects unauthorized access (403 from RLS or 401 from endpoint).
    const response = await request.post("/api/shopping-list-items/00000000-0000-0000-0000-000000000000/checkoff", {
      form: { qty_purchased: "1" },
    });
    expect([401, 403]).toContain(response.status());
  });
});

// ForeverTale integration check:
//   1. Landing page shows "Sign in with muellerauth" when anonymous.
//   2. /api/me returns { user: null } for anonymous requests.
//   3. After logging into muellerauth (cookie is on .themuellerhouse.com),
//      the landing page's fetch to /api/me resolves the authenticated user
//      and renders their email/displayName.

import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.SEED_TEST_EMAIL || "test@themuellerhouse.com";
const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD!;

test.beforeAll(() => {
  if (!TEST_PASSWORD) throw new Error("SEED_TEST_PASSWORD must be set");
});

test("anonymous landing shows login button, /api/me returns null user", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /sign in with muellerauth/i })).toBeVisible();

  const me = await context.request.get("/api/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).user).toBeNull();
});

test("end-to-end muellerauth sign-in surfaces the authed view", async ({ page, context }) => {
  await page.goto("/");
  await page.click("a:has-text('Sign in with muellerauth')");

  await expect(page).toHaveURL(/auth\.themuellerhouse\.com\/login/);
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL(/forevertale\.themuellerhouse\.com/, { timeout: 20_000 });
  await expect(page.locator("#email")).toHaveText(new RegExp(TEST_EMAIL, "i"));

  const me = await context.request.get("/api/me");
  expect(me.status()).toBe(200);
  const body = await me.json();
  expect(body.user.email.toLowerCase()).toBe(TEST_EMAIL.toLowerCase());
});

test("protected endpoint returns 401 with a login URL when unauthenticated", async ({ context }) => {
  const res = await context.request.post("/api/stories", {
    data: { playerName: "x", interviewExchanges: [] },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.loginUrl).toContain("auth.themuellerhouse.com/login");
});

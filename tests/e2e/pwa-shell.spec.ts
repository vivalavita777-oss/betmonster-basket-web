import { expect, test } from "@playwright/test";

test("match center pages render on desktop and mobile", async ({ page }) => {
  await page.goto("/basket/2026-07-17");
  await expect(page.getByRole("heading", { name: "Match Center" })).toBeVisible();

  await page.goto("/basket/nbl1/2026-07-18");
  await expect(page.getByRole("link", { name: "NBL1" })).toBeVisible();
});

test("performance page renders", async ({ page }) => {
  await page.goto("/performance");
  await expect(page.getByRole("heading", { name: "Performance" })).toBeVisible();
});

test("offline page renders", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByText(/OFFLINE/)).toBeVisible();
});

test("match page renders full frozen snapshot", async ({ page }) => {
  await page.goto("/match/302600684");
  await expect(page.getByText("FROZEN SNAPSHOT")).toBeVisible();
  await expect(page.getByText(/Revision: 9642e5eb0a18/)).toBeVisible();
  await expect(page.getByText(/Source: EXP/)).toBeVisible();
});

test("match page renders partial frozen fallback", async ({ page }) => {
  await page.goto("/match/302601098");
  await expect(page.getByText("PARTIAL LEDGER FALLBACK")).toBeVisible();
});

test("match center shows API unavailable state", async ({ page }) => {
  await page.route("**/api/backend/api/v1/public/basket/matches?**", (route) => route.abort());
  await page.goto("/basket/2026-07-17");
  await expect(page.getByText("API unavailable")).toBeVisible();
});

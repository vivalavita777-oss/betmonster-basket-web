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

test("match center shows API unavailable state", async ({ page }) => {
  await page.route("**/api/backend/api/v1/public/basket/matches?**", (route) => route.abort());
  await page.goto("/basket/2026-07-17");
  await expect(page.getByText("API unavailable")).toBeVisible();
});

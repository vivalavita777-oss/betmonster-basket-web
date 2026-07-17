import { expect, test } from "@playwright/test";

test("match center pages render on desktop and mobile", async ({ page }) => {
  await page.goto("/basket/2026-07-17", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Match Center" })).toBeVisible();

  await page.goto("/basket/nbl1/2026-07-18", { waitUntil: "domcontentloaded" });
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
  await expect(page.getByText("9642e5eb0a18").first()).toBeVisible();
  await expect(page.getByText("EXP").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Live Center" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Markets", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team Form" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shot Markets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Result comparison" })).toBeVisible();
  await expect(page.getByRole("row", { name: /IT Away UNDER 102\.5/ }).last()).toBeVisible();
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

test("match page keeps optional live endpoint failure isolated", async ({ page }) => {
  await page.route("**/api/backend/api/v1/public/basket/matches/302600684/live", (route) => route.abort());
  await page.goto("/match/302600684");

  await expect(page.getByRole("heading", { name: "Prematch" })).toBeVisible();
  await expect(page.getByText("Live data temporarily unavailable")).toBeVisible();
});

test("match page updates live score and signals from client polling", async ({ page }) => {
  let liveCalls = 0;
  let signalCalls = 0;
  await page.route("**/api/backend/api/v1/public/basket/matches/302600684/live", (route) => {
    liveCalls += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        game_id: "302600684",
        available: true,
        status: "live",
        score: liveCalls > 1 ? { home: 12, away: 9 } : { home: 10, away: 9 },
        clock: { period: "Q1", timer: "06:12" },
        live_market: { total: { line: 166.5, over_odds: 1.9, under_odds: 1.91 } },
        live_projection: { total: 171, home_total: 88, away_total: 83 },
        live_shot_markets: {
          three_pm: {
            home: { current: liveCalls > 1 ? 3 : 2, line: 8.5, projection_final: 9.8, remaining_projection: 6.8, edge: 1.3, pick: "OVER", odds_over: 1.88, odds_under: 1.94 },
            away: { current: 1, line: 7.5, projection_final: 7.1, remaining_projection: 6.1, edge: -0.4, pick: "UNDER", odds_over: 1.9, odds_under: 1.9 },
            total: { current: 4, line: 16.5, projection_final: 16.9, remaining_projection: 12.9, edge: 0.4, pick: "OVER", odds_over: 1.91, odds_under: 1.89 },
          },
        },
        updated_at: new Date().toISOString(),
      }),
    });
  });
  await page.route("**/api/backend/api/v1/public/basket/matches/302600684/signals", (route) => {
    signalCalls += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        game_id: "302600684",
        count: signalCalls > 1 ? 2 : 1,
        items: [
          { signal_no: "s1", market: "Total", selection: "OVER", line: 166.5, odds: 1.91, edge: 4.5, status: "PLAY", created_at: "2026-07-17T10:00:00Z" },
          ...(signalCalls > 1 ? [{ signal_no: "s2", market: "Home 3PM", selection: "OVER", line: 8.5, odds: 1.88, edge: 1.3, status: "WATCH", created_at: "2026-07-17T10:00:10Z" }] : []),
        ],
      }),
    });
  });

  await page.goto("/match/302600684");
  await expect(page.getByText("10 : 9")).toBeVisible();
  await expect(page.locator("#live-center").getByText("Home 3PM")).toBeVisible();
  await expect(page.getByText("1 SIGNALS")).toBeVisible();
  await page.waitForTimeout(10500);
  await expect(page.getByText("12 : 9")).toBeVisible();
  await expect(page.getByText("2 SIGNALS")).toBeVisible();
});

for (const viewport of [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`match page mobile sticky tabs fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/match/302600684");
    await expect(page.locator(".stickyTabs")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

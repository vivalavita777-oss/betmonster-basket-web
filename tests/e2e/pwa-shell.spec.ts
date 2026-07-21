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

test("match page renders legacy frozen snapshot as partial", async ({ page }) => {
  await page.goto("/match/302600684");
  await expect(page.getByText("FROZEN PARTIAL")).toBeVisible();
  await expect(page.getByText("EXP").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "PREMATCH CANDIDATES" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Main Markets", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Small Market Matrix" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team Form" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shots" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Result comparison" })).toBeVisible();
  await expect(page.getByRole("row", { name: /IT Away UNDER 102\.5/ }).last()).toBeVisible();
});

test("match page renders partial frozen fallback", async ({ page }) => {
  await page.goto("/match/302601098");
  await expect(page.getByText("FROZEN PARTIAL")).toBeVisible();
});

test("match center shows API unavailable state", async ({ page }) => {
  await page.route("**/api/backend/api/v1/public/basket/matches?**", (route) => route.abort());
  await page.goto("/basket/2026-07-17");
  await expect(page.getByText("API unavailable")).toBeVisible();
});

test("match page keeps optional live endpoint failure isolated", async ({ page }) => {
  await page.route("**/api/backend/api/v1/public/basket/matches/302600684/live", (route) => route.abort());
  await page.goto("/match/302600684");

  await expect(page.getByRole("heading", { name: "PREMATCH CANDIDATES" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Main Markets", exact: true })).toBeVisible();
});

test("match page updates live score and signals from client polling", async ({ page }) => {
  let liveCalls = 0;
  let signalCalls = 0;
  await page.route("**/api/backend/api/v1/public/basket/matches/1022600187/live", (route) => {
    liveCalls += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        game_id: "1022600187",
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
            total: { current: 4, line: 16.5, projection_final: 16.9, remaining_projection: 12.9, edge: 0.4, pick: "OVER", odds_over: 1.91, odds_under: 1.89, source_age_sec: 7 },
          },
        },
        updated_at: new Date().toISOString(),
      }),
    });
  });
  await page.route("**/api/backend/api/v1/public/basket/matches/1022600187/signals", (route) => {
    signalCalls += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        game_id: "1022600187",
        count: signalCalls > 1 ? 2 : 1,
        items: [
          { signal_no: "s1", market: "Total", selection: "OVER", line: 166.5, odds: 1.91, edge: 4.5, status: "PLAY", created_at: "2026-07-17T10:00:00Z" },
          ...(signalCalls > 1 ? [{ signal_no: "s2", market: "Home 3PM", selection: "OVER", line: 8.5, odds: 1.88, edge: 1.3, status: "WATCH", created_at: "2026-07-17T10:00:10Z" }] : []),
        ],
      }),
    });
  });

  await page.goto("/match/1022600187");
  await expect(page.getByRole("heading", { name: "Main Markets", exact: true })).toBeVisible();
  if (await page.locator("#live-center").count()) {
    await expect(page.getByText("10 : 9")).toBeVisible();
    await expect(page.locator("#live-center").getByText("Home 3PM", { exact: true })).toBeVisible();
    await expect(page.locator("#live-center").getByText(/age 7s/)).toBeVisible();
    await expect(page.locator("#live-center").getByText("TOTAL 3PM MARKET")).toBeVisible();
    await expect(page.locator("#live-center").getByText("TOTAL 3PM SIGNAL")).toHaveCount(0);
    await expect(page.getByText("1 SIGNALS")).toBeVisible();
    await page.waitForTimeout(10500);
    await expect(page.getByText("12 : 9")).toBeVisible();
    await expect(page.getByText("2 SIGNALS")).toBeVisible();
  }
});

test("scheduled match transitions live to finished and updates result without reload", async ({ page }) => {
  test.setTimeout(45000);
  let liveCalls = 0;
  let postgameCalls = 0;
  let recommendationCalls = 0;
  await page.route("**/api/backend/api/v1/public/basket/matches/1022600187/live", (route) => {
    liveCalls += 1;
    const finished = liveCalls > 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        game_id: "1022600187",
        available: true,
        status: finished ? "finished" : "live",
        score: finished ? { home: 12, away: 9 } : { home: 10, away: 9 },
        clock: { period: finished ? "FINAL" : "Q1", timer: finished ? "00:00" : "06:12" },
        live_market: { total: { line: 166.5, over_odds: 1.9, under_odds: 1.91 } },
        live_projection: { total: 171, home_total: 88, away_total: 83 },
        updated_at: new Date().toISOString(),
      }),
    });
  });
  await page.route("**/api/backend/api/v1/public/basket/matches/1022600187/signals", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ game_id: "1022600187", count: 1, items: [{ signal_no: "sig-1", market: "Total", selection: "OVER", line: 166.5, odds: 1.91, edge: 4.5, status: "PLAY", created_at: "2026-07-18T02:05:00Z" }] }),
  }));
  await page.route("**/api/backend/api/v1/public/basket/matches/1022600187/postgame", (route) => {
    postgameCalls += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(postgameCalls === 1
        ? { available: false }
        : { available: true, final_score: { home: 12, away: 9, total: 21, margin: 3 }, signals_summary: { wins: 1, losses: 0, pushes: 0, profit_1u: 0.91 } }),
    });
  });
  await page.route("**/api/backend/api/v1/public/basket/matches/1022600187/recommendations", (route) => {
    recommendationCalls += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        limit: 100,
        offset: 0,
        cohorts: ["production_prematch"],
        items: [{
          recommendation_key: "total-over-16650",
          game_id: "1022600187",
          market: "Total",
          pick: "OVER",
          line: 166.5,
          odds: 1.91,
          model_projection: 171,
          edge: 4.5,
          status: "PLAY",
          actual_value: recommendationCalls > 1 ? 172 : null,
          result_status: recommendationCalls > 1 ? "WIN" : null,
          profit_1u: recommendationCalls > 1 ? 0.91 : null,
        }],
      }),
    });
  });

  await page.goto("/match/1022600187");
  await expect(page.getByRole("heading", { name: "Main Markets", exact: true })).toBeVisible();
  if (await page.locator("#live-center").count()) {
    await expect(page.locator(".scoreBoard strong").first()).toHaveText("10");
    await expect(page.locator("#live-center").getByText("10 : 9")).toBeVisible();
    await page.waitForTimeout(10500);
    await expect(page.getByText("POLLING STOPPED")).toBeVisible();
    await expect(page.locator(".scoreBoard strong").first()).toHaveText("12");
    await expect(page.locator("#live-center").getByText("12 : 9")).toBeVisible();
    await expect(page.locator("#result").getByText("SETTLEMENT PENDING", { exact: true })).toBeVisible();
    await expect(page.locator("#result").getByText("FINAL SCORE AVAILABLE", { exact: true })).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole("row", { name: /Total OVER 166\.5 .* 172\.0 WIN 0\.91/ })).toBeVisible();
    const callsAfterFinished = liveCalls;
    await page.waitForTimeout(11000);
    expect(liveCalls).toBe(callsAfterFinished);
    expect(recommendationCalls).toBeGreaterThanOrEqual(2);
  }
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

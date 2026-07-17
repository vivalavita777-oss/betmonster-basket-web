import { describe, expect, it } from "vitest";

import {
  buildResultComparison,
  calculateSpreadEdge,
  effectiveMatchStatus,
  getQuarterProfiles,
  heuristicBadges,
  normalizeLiveMarkets,
  normalizeLiveThreePm,
  normalizePrematchMarkets,
} from "@/lib/matchUtils";
import type { FrozenPrematchResponse, LiveResponse, PrematchResponse } from "@/lib/matchTypes";

describe("Phase C match utilities", () => {
  it("uses canonical spread edge formula for positive and negative handicaps", () => {
    expect(calculateSpreadEdge(7.1, -8.5, "home")).toBeCloseTo(-1.4);
    expect(calculateSpreadEdge(7.1, 8.5, "away")).toBeCloseTo(1.4);
    expect(calculateSpreadEdge(-3.2, 2.5, "home")).toBeCloseTo(-0.7);
    expect(calculateSpreadEdge(-3.2, -2.5, "away")).toBeCloseTo(0.7);
  });

  it("normalizes prematch markets with numeric team totals", () => {
    const rows = normalizePrematchMarkets(
      {
        total: { line: 166.5, odds_over: 1.9, odds_under: 1.91 },
        team_totals: { home: 86.5, away: 80 },
      },
      { consensus: { total: 169, home: 89, away: 78 } },
    );

    expect(rows.find((row) => row.key === "it_home")).toMatchObject({ line: 86.5, projection: 89, pick: "OVER" });
    expect(rows.find((row) => row.key === "it_away")).toMatchObject({ line: 80, projection: 78, pick: "UNDER" });
  });

  it("normalizes live markets and derives away spread from home line", () => {
    const rows = normalizeLiveMarkets({
      live_market: {
        spread: { line: -4.5, home_odds: 1.87, away_odds: 1.95 },
        team_totals: { home: { line: 43.5 }, away: { line: 40.5 } },
      },
      live_projection: { home_total: 47, away_total: 39 },
    });

    expect(rows.find((row) => row.key === "live_spread_home")).toMatchObject({ line: -4.5, edge: 3.5, pick: "HOME_COVER" });
    expect(rows.find((row) => row.key === "live_spread_away")).toMatchObject({ line: 4.5, edge: -3.5, pick: "AWAY_COVER" });
    expect(rows.find((row) => row.key === "live_it_home")).toMatchObject({ line: 43.5, projection: 47 });
  });

  it("keeps finished status effective when live returns not_live", () => {
    expect(effectiveMatchStatus("finished", "not_live")).toBe("finished");
    expect(effectiveMatchStatus("scheduled", "live")).toBe("live");
    expect(effectiveMatchStatus("scheduled", null)).toBe("scheduled");
  });

  it("does not use legacy quarter shot data for quarter profiles", () => {
    const prematch = { segments: null, legacy_quarter_shots: { data: { Q1: { projection: 21 } } } } as unknown as PrematchResponse;
    const frozen = { available: false, source: "fallback_ledger", partial: true } as FrozenPrematchResponse;

    expect(getQuarterProfiles(frozen, prematch)).toEqual([]);
  });

  it("normalizes live 3PM cards per side without collapsing reasons", () => {
    const live: LiveResponse = {
      live_shot_markets: {
        three_pm: {
          home: { current: 4, line: 8.5, projection_final: 10.1, edge: 1.6, pick: "OVER" },
          total: { available: false, reason: "total_paused" },
        },
      },
    };

    const rows = normalizeLiveThreePm(live);
    expect(rows.find((row) => row.key === "home")?.item.pick).toBe("OVER");
    expect(rows.find((row) => row.key === "away")?.item.reason).toBe("away_3pm_unavailable");
    expect(rows.find((row) => row.key === "total")?.item.reason).toBe("total_paused");
  });

  it("preserves source_age_sec in live 3PM cards", () => {
    const rows = normalizeLiveThreePm({
      live_shot_markets: { three_pm: { total: { current: 5, line: 15.5, source_age_sec: 7 } } },
    });

    expect(rows.find((row) => row.key === "total")?.item.source_age_sec).toBe(7);
  });

  it("matches result comparison rows with stable market/pick/line identifiers", () => {
    const rows = buildResultComparison(
      [{ game_id: "g1", market: "Total", pick: "OVER", line: 166.5, odds: 1.91, model_projection: 170, edge: 3.5 }],
      [{ game_id: "g1", market: "Total", pick: "OVER", line: 166.5, actual_value: 172, result_status: "WIN", profit_1u: 0.91 }],
    );

    expect(rows[0]).toMatchObject({ actualValue: 172, resultStatus: "WIN", profit1u: 0.91 });
  });

  it("matches frozen recommendation without game_id to settled ledger with game_id", () => {
    const rows = buildResultComparison(
      [{ market: " total ", pick: " over ", line: 166.504, odds: 1.91, model_projection: 170, edge: 3.5 }],
      [{ game_id: "g1", market: "TOTAL", pick: "OVER", line: 166.5, actual_value: 172, result_status: "WIN", profit_1u: 0.91 }],
    );

    expect(rows[0]).toMatchObject({ actualValue: 172, resultStatus: "WIN", profit1u: 0.91 });
  });

  it("hydrates result comparison rows from postgame market results", () => {
    const rows = buildResultComparison(
      [{ market: "Total", pick: "OVER", line: 166.5 }],
      [],
      { available: true, market_results: [{ market: "Total", selection: "OVER", line: 166.5, actual_value: 172, result_status: "WIN", profit_1u: 0.91 }] },
    );

    expect(rows[0]).toMatchObject({ actualValue: 172, resultStatus: "WIN", profit1u: 0.91 });
  });

  it("labels postgame best bet as heuristic and low confidence", () => {
    expect(heuristicBadges({ available: true, best_bet_result: { market: "Total", selection: "OVER" } })).toEqual([
      "HEURISTIC BEST SIGNAL",
      "LOW CONFIDENCE",
    ]);
  });

  it("marks missing market data as missing_data", () => {
    const rows = normalizePrematchMarkets(null, null);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.status === "missing_data" && row.pick === null && row.edge === null)).toBe(true);
  });
});

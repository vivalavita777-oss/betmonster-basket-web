import type { RecommendationItem } from "./api";
import type {
  ApiObject,
  FrozenPrematchResponse,
  LiveResponse,
  LiveThreePmMarket,
  MarketBlock,
  ModelBlock,
  NormalizedMarket,
  PostgameResponse,
  PrematchResponse,
  QuarterProfile,
  ResultComparisonRow,
  SignalItem,
} from "./matchTypes";

export function asObject(value: unknown): ApiObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ApiObject) : {};
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function marketBlock(value: unknown): MarketBlock {
  return asObject(value) as MarketBlock;
}

function modelProjection(models: Record<string, ModelBlock | ApiObject | null> | null | undefined, key: string): number | null {
  const consensus = asObject(models?.consensus || models?.nbl1_core);
  if (key === "total") return asNumber(consensus.total ?? consensus.total_projection);
  if (key === "spread") return asNumber(consensus.spread ?? consensus.spread_projection);
  if (key === "it_home") return asNumber(consensus.home ?? consensus.home_projection);
  if (key === "it_away") return asNumber(consensus.away ?? consensus.away_projection);
  return null;
}

function pickFromEdge(edge: number | null, over = "OVER", under = "UNDER"): string | null {
  if (edge == null || edge === 0) return null;
  return edge > 0 ? over : under;
}

export function normalizePrematchMarkets(
  markets: ApiObject | null | undefined,
  models?: Record<string, ModelBlock | ApiObject | null> | null,
): NormalizedMarket[] {
  const source = asObject(markets);
  const spread = marketBlock(source.spread);
  const total = marketBlock(source.total);
  const itHome = marketBlock(source.it_home);
  const itAway = marketBlock(source.it_away);
  const teamTotals = asObject(source.team_totals);

  const rows = [
    buildMarket("spread", "Spread", asNumber(spread.home ?? spread.line), null, null, modelProjection(models, "spread"), "HOME_COVER", "AWAY_COVER", spread.available, spread.unavailable_reason),
    buildMarket("total", "Total", asNumber(total.line), asNumber(total.odds_over), asNumber(total.odds_under), modelProjection(models, "total"), "OVER", "UNDER", total.available, total.unavailable_reason),
    buildMarket("it_home", "Home team total", asNumber(teamTotals.home ?? itHome.line), asNumber(itHome.odds_over), asNumber(itHome.odds_under), modelProjection(models, "it_home"), "OVER", "UNDER", itHome.available, itHome.unavailable_reason),
    buildMarket("it_away", "Away team total", asNumber(teamTotals.away ?? itAway.line), asNumber(itAway.odds_over), asNumber(itAway.odds_under), modelProjection(models, "it_away"), "OVER", "UNDER", itAway.available, itAway.unavailable_reason),
  ];
  return rows;
}

export function normalizeLiveMarkets(live: LiveResponse): NormalizedMarket[] {
  const source = asObject(live.live_market);
  const projection = asObject(live.live_projection);
  const total = marketBlock(source.total);
  const spread = marketBlock(source.spread);
  const teamTotals = asObject(source.team_totals);
  const homeTotal = marketBlock(asObject(teamTotals.home));
  const awayTotal = marketBlock(asObject(teamTotals.away));
  const spreadLine = asNumber(spread.line);

  return [
    buildMarket("live_total", "Live total", asNumber(total.line), asNumber(total.over_odds ?? total.odds_over), asNumber(total.under_odds ?? total.odds_under), asNumber(projection.total), "OVER", "UNDER", total.available, total.unavailable_reason),
    buildMarket("live_spread_home", "Live spread home", spreadLine, asNumber(spread.home_odds), asNumber(spread.away_odds), asNumber(projection.home_total) !== null && asNumber(projection.away_total) !== null ? (asNumber(projection.home_total) || 0) - (asNumber(projection.away_total) || 0) : null, "HOME_COVER", "AWAY_COVER", spread.available, spread.unavailable_reason),
    buildMarket("live_spread_away", "Live spread away", asNumber(spread.away) ?? (spreadLine == null ? null : -spreadLine), asNumber(spread.away_odds), asNumber(spread.home_odds), null, null, null, spread.available, spread.unavailable_reason),
    buildMarket("live_it_home", "Live home total", asNumber(homeTotal.line), asNumber(homeTotal.over_odds), asNumber(homeTotal.under_odds), asNumber(projection.home_total), "OVER", "UNDER", homeTotal.available, homeTotal.unavailable_reason),
    buildMarket("live_it_away", "Live away total", asNumber(awayTotal.line), asNumber(awayTotal.over_odds), asNumber(awayTotal.under_odds), asNumber(projection.away_total), "OVER", "UNDER", awayTotal.available, awayTotal.unavailable_reason),
  ];
}

function buildMarket(
  key: string,
  label: string,
  line: number | null,
  overOdds: number | null,
  underOdds: number | null,
  projection: number | null,
  overPick: string | null,
  underPick: string | null,
  available?: boolean | null,
  unavailableReason?: string | null,
): NormalizedMarket {
  const edge = projection != null && line != null ? projection - line : null;
  return {
    key,
    label,
    line,
    overOdds,
    underOdds,
    projection,
    edge,
    pick: pickFromEdge(edge, overPick || "OVER", underPick || "UNDER"),
    status: available === false ? unavailableReason || "unavailable" : "available",
  };
}

export function normalizeLiveThreePm(live: LiveResponse): Array<{ key: "home" | "away" | "total"; label: string; item: LiveThreePmMarket }> {
  const three = live.live_shot_markets?.three_pm || {};
  return [
    { key: "home", label: "Home 3PM", item: three.home || { available: false, reason: three.reason || "home_3pm_unavailable" } },
    { key: "away", label: "Away 3PM", item: three.away || { available: false, reason: three.reason || "away_3pm_unavailable" } },
    { key: "total", label: "Total 3PM", item: three.total || { available: false, reason: three.reason || "total_3pm_unavailable" } },
  ];
}

export function getQuarterProfiles(frozen: FrozenPrematchResponse, prematch: PrematchResponse): QuarterProfile[] {
  const analytics = asObject(frozen.analytics);
  const source = asObject(analytics.period_profiles || analytics.quarter_profiles || prematch.segments);
  const labels = ["Q1", "H1", "Q2", "Q3", "Q4"];
  return labels.flatMap((label) => {
    const raw = asObject(source[label] || source[label.toLowerCase()]);
    if (!Object.keys(raw).length) return [];
    return [{
      label,
      line: asNumber(raw.line),
      projection: asNumber(raw.projection),
      edge: asNumber(raw.edge),
      homeAverage: asNumber(raw.home_average ?? raw.homeAverage),
      awayAverage: asNumber(raw.away_average ?? raw.awayAverage),
      combinedAverage: asNumber(raw.combined_average ?? raw.combinedAverage),
      sampleSize: asNumber(raw.sample_size ?? raw.sampleSize),
    }];
  });
}

export function shotMarketRows(markets: ApiObject | null | undefined): Array<{ label: string; line: number | null; projection: number | null; edge: number | null }> {
  const root = asObject(markets);
  const sideLabel: Record<string, string> = { home: "Home", away: "Away", total: "Total" };
  return Object.entries(sideLabel).flatMap(([side, label]) => {
    const sideRoot = asObject(root[side]);
    return ["fg2m", "fg3m"].map((field) => {
      const block = asObject(sideRoot[field]);
      const line = asNumber(block.line);
      const projection = asNumber(block.projection);
      return {
        label: `${label} ${field === "fg3m" ? "3PM" : "2PM"}`,
        line,
        projection,
        edge: projection != null && line != null ? projection - line : null,
      };
    });
  });
}

export function comparisonKey(item: RecommendationItem): string {
  return [item.game_id, item.market, item.pick, item.line].map((part) => String(part ?? "")).join("|");
}

export function buildResultComparison(
  frozenItems: RecommendationItem[],
  ledgerItems: RecommendationItem[],
): ResultComparisonRow[] {
  const ledger = new Map(ledgerItems.map((item) => [comparisonKey(item), item]));
  const merged = frozenItems.length ? frozenItems : ledgerItems;
  return merged.map((item, index) => {
    const settled = ledger.get(comparisonKey(item)) || item;
    return {
      key: comparisonKey(item) || `row-${index}`,
      market: item.market ?? null,
      pick: item.pick ?? null,
      line: item.line ?? null,
      odds: item.odds ?? null,
      projection: item.model_projection ?? null,
      edge: item.edge ?? null,
      actualValue: settled.actual_value ?? null,
      resultStatus: settled.result_status ?? null,
      profit1u: settled.profit_1u ?? null,
    };
  });
}

export function heuristicBadges(postgame: PostgameResponse): string[] {
  return postgame.best_bet_result ? ["HEURISTIC BEST SIGNAL", "LOW CONFIDENCE"] : [];
}

export function signalKey(signal: SignalItem): string {
  return signal.signal_no || [signal.market, signal.selection, signal.created_at].map((part) => part || "").join("|");
}

export function isLiveStatus(status?: string | null): boolean {
  return ["live", "inprogress", "in_progress", "playing", "q1", "q2", "q3", "q4", "halftime"].includes(String(status || "").toLowerCase());
}

export function isFinishedStatus(status?: string | null): boolean {
  return ["finished", "final", "closed"].includes(String(status || "").toLowerCase());
}

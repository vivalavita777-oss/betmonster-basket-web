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

export function calculateTotalEdge(projection: number | null, line: number | null): number | null {
  return projection != null && line != null ? projection - line : null;
}

export function calculateTeamTotalEdge(projection: number | null, line: number | null): number | null {
  return calculateTotalEdge(projection, line);
}

export function calculateSpreadEdge(projectedMargin: number | null, handicap: number | null, side: "home" | "away"): number | null {
  if (projectedMargin == null || handicap == null) return null;
  return side === "home" ? projectedMargin + handicap : -projectedMargin + handicap;
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
  const teamTotalHome = marketBlock(teamTotals.home);
  const teamTotalAway = marketBlock(teamTotals.away);

  const projectedMargin = asNumber(spread.projected_margin) ?? modelProjection(models, "spread");
  const rows = [
    buildSpreadMarket("spread", "Spread", asNumber(spread.home_line ?? spread.home ?? spread.line), asNumber(spread.home_odds), asNumber(spread.away_odds), projectedMargin, "home", spread.available, spread.unavailable_reason),
    buildMarket("total", "Total", asNumber(total.line), asNumber(total.odds_over), asNumber(total.odds_under), asNumber(total.projection) ?? modelProjection(models, "total"), "OVER", "UNDER", total.available, total.unavailable_reason),
    buildMarket("it_home", "Home team total", asNumber(teamTotalHome.line ?? teamTotals.home ?? itHome.line), asNumber(teamTotalHome.odds_over ?? itHome.odds_over), asNumber(teamTotalHome.odds_under ?? itHome.odds_under), asNumber(teamTotalHome.projection) ?? modelProjection(models, "it_home"), "OVER", "UNDER", teamTotalHome.available ?? itHome.available, teamTotalHome.unavailable_reason ?? itHome.unavailable_reason),
    buildMarket("it_away", "Away team total", asNumber(teamTotalAway.line ?? teamTotals.away ?? itAway.line), asNumber(teamTotalAway.odds_over ?? itAway.odds_over), asNumber(teamTotalAway.odds_under ?? itAway.odds_under), asNumber(teamTotalAway.projection) ?? modelProjection(models, "it_away"), "OVER", "UNDER", teamTotalAway.available ?? itAway.available, teamTotalAway.unavailable_reason ?? itAway.unavailable_reason),
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
  const liveMargin = asNumber(projection.home_total) !== null && asNumber(projection.away_total) !== null
    ? (asNumber(projection.home_total) || 0) - (asNumber(projection.away_total) || 0)
    : null;

  return [
    buildMarket("live_total", "Live total", asNumber(total.line), asNumber(total.over_odds ?? total.odds_over), asNumber(total.under_odds ?? total.odds_under), asNumber(projection.total), "OVER", "UNDER", total.available, total.unavailable_reason),
    buildSpreadMarket("live_spread_home", "Live spread home", spreadLine, asNumber(spread.home_odds), asNumber(spread.away_odds), liveMargin, "home", spread.available, spread.unavailable_reason),
    buildSpreadMarket("live_spread_away", "Live spread away", asNumber(spread.away) ?? (spreadLine == null ? null : -spreadLine), asNumber(spread.away_odds), asNumber(spread.home_odds), liveMargin, "away", spread.available, spread.unavailable_reason),
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
  const edge = calculateTotalEdge(projection, line);
  const missing = line == null && projection == null && overOdds == null && underOdds == null;
  return {
    key,
    label,
    line,
    overOdds,
    underOdds,
    projection,
    edge: missing ? null : edge,
    pick: missing ? null : pickFromEdge(edge, overPick || "OVER", underPick || "UNDER"),
    status: missing ? "missing_data" : available === false ? unavailableReason || "unavailable" : "available",
  };
}

function buildSpreadMarket(
  key: string,
  label: string,
  line: number | null,
  overOdds: number | null,
  underOdds: number | null,
  projectedMargin: number | null,
  side: "home" | "away",
  available?: boolean | null,
  unavailableReason?: string | null,
): NormalizedMarket {
  const edge = calculateSpreadEdge(projectedMargin, line, side);
  const missing = line == null && projectedMargin == null && overOdds == null && underOdds == null;
  return {
    key,
    label,
    line,
    overOdds,
    underOdds,
    projection: projectedMargin,
    edge: missing ? null : edge,
    pick: missing ? null : pickFromEdge(edge, side === "home" ? "HOME_COVER" : "AWAY_COVER", side === "home" ? "AWAY_COVER" : "HOME_COVER"),
    status: missing ? "missing_data" : available === false ? unavailableReason || "unavailable" : "available",
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

function normalizeLine(value: number | null | undefined): string {
  return value == null ? "" : value.toFixed(2);
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

export function comparisonKey(item: RecommendationItem): string {
  if (item.recommendation_key) return item.recommendation_key;
  return [normalizeText(item.market), normalizeText(item.pick), normalizeLine(item.line)].join("|");
}

export function comparisonAliases(item: RecommendationItem): string[] {
  return Array.from(new Set([
    item.recommendation_key || null,
    [normalizeText(item.market), normalizeText(item.pick), normalizeLine(item.line)].join("|"),
  ].filter(Boolean) as string[]));
}

export function buildResultComparison(
  frozenItems: RecommendationItem[],
  ledgerItems: RecommendationItem[],
  postgame?: PostgameResponse,
): ResultComparisonRow[] {
  const ledger = new Map(ledgerItems.flatMap((item) => comparisonAliases(item).map((key) => [key, item] as [string, RecommendationItem])));
  const postgameResults = postgameResultMap(postgame);
  const merged = frozenItems.length ? frozenItems : ledgerItems;
  if (!merged.length && postgameResults.size) {
    return Array.from(postgameResults.entries()).map(([key, row]) => ({
      key,
      market: asString(row.market),
      pick: asString(row.pick ?? row.selection),
      line: asNumber(row.line),
      odds: asNumber(row.odds),
      projection: asNumber(row.projection ?? row.model_projection),
      edge: asNumber(row.edge),
      actualValue: asNumber(row.actual_value),
      resultStatus: asString(row.result_status ?? row.result),
      profit1u: asNumber(row.profit_1u),
    }));
  }
  return merged.map((item, index) => {
    const settled = comparisonAliases(item).map((key) => ledger.get(key)).find(Boolean) || item;
    const postgameSettled = comparisonAliases(item).map((key) => postgameResults.get(key)).find(Boolean);
    return {
      key: comparisonKey(item) || `row-${index}`,
      market: item.market ?? null,
      pick: item.pick ?? null,
      line: item.line ?? null,
      odds: item.odds ?? null,
      projection: item.model_projection ?? null,
      edge: item.edge ?? null,
      actualValue: asNumber(postgameSettled?.actual_value) ?? settled.actual_value ?? null,
      resultStatus: asString(postgameSettled?.result_status ?? postgameSettled?.result) ?? settled.result_status ?? null,
      profit1u: asNumber(postgameSettled?.profit_1u) ?? settled.profit_1u ?? null,
    };
  });
}

export function isSettlementComplete(rows: ResultComparisonRow[]): boolean {
  return rows.some((row) => ["WIN", "LOSS", "PUSH"].includes(String(row.resultStatus || "").toUpperCase()));
}

function postgameResultMap(postgame?: PostgameResponse): Map<string, ApiObject> {
  const source = postgame?.market_results;
  const rows: ApiObject[] = [];
  if (Array.isArray(source)) {
    rows.push(...source.map(asObject));
  } else {
    for (const [key, value] of Object.entries(asObject(source))) {
      const item = asObject(value);
      rows.push({ recommendation_key: key, ...item });
    }
  }
  return new Map(rows.flatMap((row) => {
    const market = asString(row.market);
    const pick = asString(row.pick ?? row.selection);
    const line = asNumber(row.line);
    const recommendationKey = asString(row.recommendation_key);
    const keys = [
      recommendationKey,
      (market || pick || line != null) ? [normalizeText(market), normalizeText(pick), normalizeLine(line)].join("|") : null,
    ].filter(Boolean) as string[];
    return keys.map((key) => [key, row] as [string, ApiObject]);
  }));
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

export function effectiveMatchStatus(initialStatus?: string | null, liveStatus?: string | null): string | null {
  if (isFinishedStatus(liveStatus)) return "finished";
  if (isLiveStatus(liveStatus)) return liveStatus || null;
  if (isFinishedStatus(initialStatus)) return "finished";
  return liveStatus || initialStatus || null;
}

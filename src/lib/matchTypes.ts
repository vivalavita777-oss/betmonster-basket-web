import type { RecommendationItem } from "./api";

export type ApiObject = Record<string, unknown>;

export type ScoreBlock = {
  home?: number | null;
  away?: number | null;
};

export type MatchDetailResponse = {
  game_id: string;
  league?: string | null;
  game_date?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  status?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  score?: ScoreBlock | null;
  quarter_scores?: Array<{ period?: string | number | null; home?: number | null; away?: number | null }> | null;
  flags?: { has_live?: boolean; has_postgame?: boolean; has_signals?: boolean } | null;
  market?: ApiObject | null;
  model_summary?: ApiObject | null;
  calculation_source?: string | null;
  calculation_revision?: string | null;
  roster_state?: string | null;
  data_quality?: ApiObject | null;
};

export type ModelBlock = {
  home?: number | null;
  away?: number | null;
  total?: number | null;
  spread?: number | null;
  home_projection?: number | null;
  away_projection?: number | null;
  total_projection?: number | null;
  spread_projection?: number | null;
};

export type MarketBlock = {
  line?: number | null;
  home_line?: number | null;
  away_line?: number | null;
  home?: number | null;
  away?: number | null;
  projection?: number | null;
  projected_margin?: number | null;
  odds_over?: number | null;
  odds_under?: number | null;
  over_odds?: number | null;
  under_odds?: number | null;
  home_odds?: number | null;
  away_odds?: number | null;
  available?: boolean | null;
  unavailable_reason?: string | null;
};

export type NormalizedMarket = {
  key: string;
  label: string;
  line: number | null;
  overOdds: number | null;
  underOdds: number | null;
  projection: number | null;
  edge: number | null;
  pick: string | null;
  status: string;
};

export type MarketKind = "total" | "team_total" | "spread";

export type PrematchResponse = {
  available?: boolean;
  public_status?: string | null;
  calculation_source?: string | null;
  calculation_revision?: string | null;
  roster_state?: string | null;
  market?: ApiObject | null;
  models?: Record<string, ModelBlock | ApiObject | null> | null;
  players?: { home?: PlayerProfile[]; away?: PlayerProfile[] } | null;
  shot_markets?: ApiObject | null;
  segments?: ApiObject | null;
  risks?: unknown[] | null;
  live_plan?: string[] | null;
  data_quality?: ApiObject | null;
};

export type PlayerProfile = {
  player_id?: string | null;
  name?: string | null;
  injured?: boolean | null;
  days_since_last_game?: number | null;
  last_game_date?: string | null;
};

export type LiveThreePmMarket = {
  available?: boolean;
  reason?: string | null;
  current?: number | null;
  line?: number | null;
  projection_final?: number | null;
  final_projection?: number | null;
  remaining_projection?: number | null;
  edge?: number | null;
  pick?: string | null;
  odds_over?: number | null;
  odds_under?: number | null;
  updated_at?: string | null;
  source_age_seconds?: number | null;
  source_age_sec?: number | null;
  signal_status?: string | null;
};

export type LiveResponse = {
  game_id?: string;
  available?: boolean;
  status?: string | null;
  score?: ScoreBlock | null;
  clock?: { period?: string | null; timer?: string | null; clock_seconds?: number | null } | null;
  live_market?: ApiObject | null;
  live_projection?: ApiObject | null;
  live_shot_markets?: {
    three_pm?: {
      available?: boolean;
      reason?: string | null;
      home?: LiveThreePmMarket;
      away?: LiveThreePmMarket;
      total?: LiveThreePmMarket;
    } | null;
  } | null;
  data_quality?: ApiObject | null;
  updated_at?: string | null;
};

export type SignalItem = {
  signal_no?: string | null;
  market?: string | null;
  selection?: string | null;
  line?: number | null;
  odds?: number | null;
  edge?: number | null;
  public_signal_type?: string | null;
  signal_rank?: number | null;
  source?: string | null;
  status?: string | null;
  result_status?: string | null;
  profit_1u?: number | null;
  created_at?: string | null;
};

export type SignalResponse = {
  game_id?: string;
  available?: boolean;
  count: number;
  reason?: string | null;
  items: SignalItem[];
  summary?: { wins?: number; losses?: number; pushes?: number; profit_1u?: number } | null;
  data_quality?: ApiObject | null;
};

export type PostgameResponse = {
  available?: boolean;
  final_score?: { home?: number; away?: number; total?: number; margin?: number } | null;
  best_bet_result?: {
    source?: string | null;
    confidence?: string | null;
    selection?: string | null;
    market?: string | null;
    odds?: number | null;
    result?: string | null;
    profit_1u?: number | null;
  } | null;
  market_results?: ApiObject | ApiObject[] | null;
  signals_summary?: { wins?: number; losses?: number; pushes?: number; profit_1u?: number } | null;
};

export type FrozenPrematchResponse = {
  available: boolean;
  source: "snapshot_store" | "fallback_ledger";
  partial: boolean;
  revision?: string | null;
  snapshot_at?: string | null;
  tipoff_at?: string | null;
  calculation_source?: string | null;
  calculation_revision?: string | null;
  roster_state?: string | null;
  items?: RecommendationItem[];
  site_recommendations?: { top_candidates?: RecommendationItem[] };
  markets?: ApiObject | null;
  models?: Record<string, ModelBlock | ApiObject | null> | null;
  analytics?: ApiObject | null;
  analytics_v2?: ApiObject | null;
  analytics_v2_available?: boolean | null;
  analytics_v2_reason?: string | null;
  analytics_v2_hash?: string | null;
  analytics_v2_generated_at?: string | null;
  analytics_v2_source_revision?: string | null;
  data_quality?: ApiObject | null;
  line_snapshot?: ApiObject | null;
  shot_markets?: ApiObject | null;
};

export type MatchAnalyticsResponse = {
  version?: "match_analytics_v2" | string;
  game_id?: string;
  league?: string | null;
  as_of?: string | null;
  snapshot_state?: string | null;
  calculation_source?: string | null;
  calculation_scope?: string | null;
  calculation_revision?: string | null;
  calculated_at?: string | null;
  roster_source?: string | null;
  roster_as_of?: string | null;
  tipoff_at?: string | null;
  match?: ApiObject | null;
  models?: Record<string, ModelBlock | ApiObject | null> | null;
  markets?: {
    main?: ApiObject | null;
    periods?: ApiObject | null;
    team_stats?: ApiObject | null;
    shots?: ApiObject | null;
  } | null;
  team_profiles?: ApiObject | null;
  h2h_games?: ApiObject[] | null;
  player_profiles?: ApiObject[] | null;
  player_props?: ApiObject[] | null;
  period_profiles?: ApiObject | null;
  lineups?: ApiObject | null;
  projection_matrix?: { version?: string | null; rows?: ApiObject[] | null; hit_rates?: ApiObject | null } | null;
  hit_rates?: ApiObject | null;
  recommendation_candidates?: ApiObject[] | null;
  source_conflicts?: ApiObject[] | null;
  roster_integrity?: ApiObject | null;
  data_quality?: ApiObject | null;
};

export type QuarterProfile = {
  label: string;
  line: number | null;
  projection: number | null;
  edge: number | null;
  homeAverage: number | null;
  awayAverage: number | null;
  combinedAverage: number | null;
  sampleSize: number | null;
};

export type ResultComparisonRow = {
  key: string;
  market: string | null;
  pick: string | null;
  line: number | null;
  odds: number | null;
  projection: number | null;
  edge: number | null;
  actualValue: number | null;
  resultStatus: string | null;
  profit1u: number | null;
};

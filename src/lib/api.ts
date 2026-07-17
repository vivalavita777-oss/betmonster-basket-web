export type MatchItem = {
  game_id: string;
  league?: string | null;
  game_date?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  status?: string | null;
  public_status?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  has_live?: boolean;
  has_signals?: boolean;
  calculation_source?: string | null;
  roster_state?: string | null;
  best_public_signal?: { market?: string | null; selection?: string | null; status?: string | null } | null;
};

export type MatchListResponse = { date: string; league?: string | null; count: number; items: MatchItem[] };

export type RecommendationItem = {
  game_id?: string | null;
  date?: string | null;
  league?: string | null;
  competition?: string | null;
  gender?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  market?: string | null;
  pick?: string | null;
  line?: number | null;
  odds?: number | null;
  edge?: number | null;
  status?: string | null;
  confidence?: string | null;
  calculation_source?: string | null;
  calculation_revision?: string | null;
  roster_state?: string | null;
  cohort?: string | null;
  result_status?: string | null;
  profit_1u?: number | null;
};

export type RecommendationsResponse = {
  count: number;
  limit: number;
  offset: number;
  cohorts: string[];
  items: RecommendationItem[];
};

export type PerformanceMetrics = {
  recommendations: number;
  settled: number;
  open: number;
  wins: number;
  losses: number;
  pushes: number;
  void: number;
  win_rate: number | null;
  profit_1u: number;
  roi: number | null;
  avg_odds: number | null;
  avg_edge: number | null;
  median_edge: number | null;
};

const BACKEND_PREFIX = "/api/backend";
const SERVER_API_BASE = process.env.BASKET_API_INTERNAL_URL || "http://127.0.0.1:8010";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${BACKEND_PREFIX}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function serverApiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${SERVER_API_BASE}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function formatPct(value: number | null | undefined): string {
  return value == null ? "-" : `${(value * 100).toFixed(1)}%`;
}

export function formatNum(value: number | null | undefined, digits = 1): string {
  return value == null ? "-" : value.toFixed(digits);
}

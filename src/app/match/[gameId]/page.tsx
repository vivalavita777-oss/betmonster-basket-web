import type { ReactNode } from "react";

import { ApiUnavailable } from "@/components/ApiUnavailable";
import { LiveMatchCenter, LiveMatchProvider, LiveResultComparison, MatchHeroScore, SignalSummaryRail } from "@/components/match/LiveMatchCenter";
import { MatchJsonDownload } from "@/components/match/MatchJsonDownload";
import { RecommendationTable } from "@/components/RecommendationTable";
import { StatusPill } from "@/components/StatusPill";
import {
  formatNum,
  formatPct,
  frozenBadgeLabel,
  frozenRecommendations,
  type RecommendationsResponse,
  serverApiGet,
} from "@/lib/api";
import {
  asNumber,
  asObject,
  getQuarterProfiles,
  isLiveStatus,
  normalizePrematchMarkets,
  shotMarketRows,
} from "@/lib/matchUtils";
import type {
  ApiObject,
  FrozenPrematchResponse,
  LiveResponse,
  MatchAnalyticsResponse,
  MatchDetailResponse,
  PostgameResponse,
  PrematchResponse,
  SignalResponse,
} from "@/lib/matchTypes";
import { formatMatchDate, formatMatchTime } from "@/lib/time";

type OptionalResult<T> = { data: T; error: string | null };

const tabs = [
  ["live-center", "Live Center"],
  ["main-markets", "Main Markets"],
  ["periods", "Periods"],
  ["team-stats", "Team Stats"],
  ["shots", "Shots"],
  ["team-form", "Team Form"],
  ["players", "Players"],
  ["signals", "Signals"],
  ["recommendations", "Recommendations"],
  ["result", "Result"],
] as const;

const emptyPrematch: PrematchResponse = { available: false, data_quality: { reason: "prematch_unavailable" } };
const emptyPostgame: PostgameResponse = { available: false };
const emptyRecommendations: RecommendationsResponse = { count: 0, limit: 0, offset: 0, cohorts: [], items: [] };
const emptyFrozen: FrozenPrematchResponse = { available: false, source: "fallback_ledger", partial: true, items: [] };
const emptyAnalytics: MatchAnalyticsResponse = { version: "match_analytics_v2", markets: {}, team_profiles: {}, player_profiles: [], player_props: [], period_profiles: {}, lineups: {}, data_quality: { overall: "partial", missing_blocks: ["analytics"] } };

export default async function MatchPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  let match: MatchDetailResponse;

  try {
    match = await serverApiGet<MatchDetailResponse>(`/api/v1/public/basket/matches/${gameId}`);
  } catch {
    return <ApiUnavailable title="Match API unavailable" />;
  }

  const [prematchResult, postgameResult, recsResult, frozenResult, analyticsResult, signalsResult] = await Promise.all([
    optionalApiGet(`/api/v1/public/basket/matches/${gameId}/prematch`, emptyPrematch),
    optionalApiGet(`/api/v1/public/basket/matches/${gameId}/postgame`, emptyPostgame),
    optionalApiGet(`/api/v1/public/basket/matches/${gameId}/recommendations`, emptyRecommendations),
    optionalApiGet(`/api/v1/public/basket/matches/${gameId}/frozen-prematch`, emptyFrozen),
    optionalApiGet(`/api/v1/public/basket/matches/${gameId}/analytics`, emptyAnalytics),
    optionalApiGet(`/api/v1/public/basket/matches/${gameId}/signals`, { game_id: gameId, available: true, count: 0, reason: "no_public_signals", items: [] } as SignalResponse),
  ]);

  const prematch = prematchResult.data;
  const postgame = postgameResult.data;
  const recs = recsResult.data;
  const frozen = frozenResult.data;
  const analytics = analyticsResult.data;
  const initialSignals = signalsResult.data;
  const liveSeed = initialLive(match);
  const frozenItems = frozenRecommendations(frozen);
  const displayAnalytics = selectDisplayAnalytics(match, analytics, frozen);
  const afterTipoff = isAfterTipoffStatus(match.status);
  const liveVisible = isLiveStatus(match.status);
  const visibleTabs = tabs.filter(([id]) => liveVisible || id !== "live-center");
  const modelSource = displayAnalytics.models || frozen.models || (!afterTipoff ? prematch.models || (asObject(match.model_summary) as FrozenPrematchResponse["models"]) : asObject(match.model_summary) as FrozenPrematchResponse["models"]) || {};
  const marketSource = asObject(displayAnalytics.markets?.main || frozen.markets || (!afterTipoff ? prematch.market || match.market : match.market || {}));
  const endpointErrors = [
    ["Prematch", prematchResult.error],
    ["Postgame", postgameResult.error],
    ["Recommendations", recsResult.error],
    ["Frozen prematch", frozenResult.error],
    ["Analytics", analyticsResult.error],
    ["Signals", signalsResult.error],
  ].filter(([, error]) => error);
  const jsonPayload: ApiObject = {
    schema_version: "match_analysis_export_v2",
    exported_at: new Date().toISOString(),
    game_id: match.game_id,
    league: match.league,
    game_date: match.game_date,
    status: match.status,
    home_team: match.home_team,
    away_team: match.away_team,
    match,
    current_prematch: prematch,
    postgame_latest: postgame,
    recommendations_latest: recs,
    frozen_prematch: frozen,
    analytics: displayAnalytics,
    signals_latest: initialSignals,
    live_latest: liveSeed,
    projection_matrix: displayAnalytics.projection_matrix,
    hit_rates: displayAnalytics.hit_rates,
    recommendation_candidates: displayAnalytics.recommendation_candidates,
    published_recommendations: recs.items,
    source_conflicts: displayAnalytics.source_conflicts,
    roster_integrity: displayAnalytics.roster_integrity,
    source_timestamps: {
      calculated_at: displayAnalytics.calculated_at,
      roster_as_of: displayAnalytics.roster_as_of,
      tipoff_at: displayAnalytics.tipoff_at,
      frozen_snapshot_at: frozen.snapshot_at,
    },
    ai_context: {
      purpose: "Basket Monster match center evaluation",
      note: "Full export contains current client state and all match-page API sources available at render time.",
    },
  };
  const compactJsonPayload: ApiObject = {
    schema_version: "match_analysis_export_v2_compact",
    exported_at: new Date().toISOString(),
    game_id: match.game_id,
    league: match.league,
    status: match.status,
    teams: { home: match.home_team, away: match.away_team },
    projection_matrix: displayAnalytics.projection_matrix,
    recommendation_candidates: displayAnalytics.recommendation_candidates,
    published_recommendations: recs.items,
    source_conflicts: displayAnalytics.source_conflicts,
    roster_integrity: displayAnalytics.roster_integrity,
    data_quality: displayAnalytics.data_quality,
  };

  return (
    <LiveMatchProvider gameId={gameId} initialLive={liveSeed} initialSignals={initialSignals} initialStatus={match.status}>
    <section className="matchPage">
      <MatchHero match={match} />
      <nav className="tabsRow stickyTabs" aria-label="Match sections">
        {visibleTabs.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
        <MatchJsonDownload payload={jsonPayload} compactPayload={compactJsonPayload} />
      </nav>

      <section className="matchLayout">
        <div className="matchMain">
          {endpointErrors.map(([label, error]) => <EndpointNotice key={label} label={label || "Endpoint"} error={error || ""} />)}
          {liveVisible ? <LiveMatchCenter /> : null}
          <TopRecommendationsSection analytics={displayAnalytics} recs={recs} />
          <MainMarketsSection markets={marketSource} models={modelSource} />
          <ProjectionMatrixSection analytics={displayAnalytics} />
          <PeriodsSection analytics={displayAnalytics} prematch={prematch} frozen={frozen} />
          <TeamStatsSection analytics={displayAnalytics} />
          <ShotMarketsSection analytics={displayAnalytics} prematch={prematch} frozen={frozen} />
          <TeamFormSection analytics={displayAnalytics} match={match} />
          <PlayersSection analytics={displayAnalytics} prematch={prematch} />
          <section className="panel" id="recommendations">
            <div className="panelHeader">
              <h2>Recommendations</h2>
              <StatusPill label={`${recs.count} PREMATCH BETS`} tone="neutral" />
            </div>
            <RecommendationTable items={recs.items} />
          </section>
          <LiveResultComparison
            initialPostgame={postgame}
            match={match}
            frozenItems={frozenItems}
            ledgerItems={recs.items}
            initialSignals={initialSignals}
          />
          <MetaFooter
            analytics={displayAnalytics}
            frozen={frozen}
            prematch={prematch}
            match={match}
            signals={initialSignals}
            postgame={postgame}
          />
        </div>
      </section>
    </section>
    </LiveMatchProvider>
  );
}

async function optionalApiGet<T>(path: string, fallback: T): Promise<OptionalResult<T>> {
  try {
    return { data: await serverApiGet<T>(path), error: null };
  } catch (error) {
    return { data: fallback, error: error instanceof Error ? error.message : "request_failed" };
  }
}

function initialLive(match: MatchDetailResponse): LiveResponse {
  return {
    game_id: match.game_id,
    available: false,
    status: match.status,
    score: match.score || { home: match.home_score, away: match.away_score },
    data_quality: { state: "client_live_fetch_pending" },
  };
}

function MetaFooter({
  analytics,
  frozen,
  prematch,
  match,
  signals,
  postgame,
}: {
  analytics: MatchAnalyticsResponse;
  frozen: FrozenPrematchResponse;
  prematch: PrematchResponse;
  match: MatchDetailResponse;
  signals: SignalResponse;
  postgame: PostgameResponse;
}) {
  return (
    <section className="panel metaFooter" id="meta">
      <div className="panelHeader">
        <h2>Meta</h2>
        <StatusPill label={frozenBadgeLabel(frozen, match.status)} tone={frozen.available && !frozen.partial ? "green" : "purple"} />
      </div>
      <div className="metaGrid">
        <RailCard title="Data Quality" rows={qualityRows(mergeQuality(analytics.data_quality, signals, frozen), match.data_quality, prematch.data_quality, frozen.data_quality)} />
        <RailCard title="Model State" rows={[
          ["Snapshot", frozen.snapshot_at || "-"],
          ["Snapshot revision", frozen.revision || "-"],
          ["Calculation revision", analytics.calculation_revision || frozen.calculation_revision || prematch.calculation_revision || match.calculation_revision || "-"],
          ["Analytics hash", frozen.analytics_v2_hash || "-"],
          ["Roster", frozen.roster_state || prematch.roster_state || match.roster_state || "-"],
        ]} />
        <SignalSummaryRail settledSummary={postgame.signals_summary} />
      </div>
    </section>
  );
}

function selectDisplayAnalytics(match: MatchDetailResponse, current: MatchAnalyticsResponse, frozen: FrozenPrematchResponse): MatchAnalyticsResponse {
  const frozenAnalytics = asObject(frozen.analytics_v2 || frozen.analytics) as MatchAnalyticsResponse;
  const afterTipoff = isAfterTipoffStatus(match.status);
  if (afterTipoff) {
    if (Object.keys(frozenAnalytics).length) {
      return { ...frozenAnalytics, data_quality: frozenAnalytics.data_quality || frozen.data_quality };
    }
    if (Object.keys(asObject(current)).length) {
      return {
        ...current,
        snapshot_state: "current_analytics_fallback",
        data_quality: {
          ...asObject(current.data_quality),
          overall: "partial",
          sources: {
            ...asObject(asObject(current.data_quality).sources),
            frozen_snapshot: { status: "missing" },
            analytics_fallback: { status: "current_after_tipoff" },
          },
          missing_blocks: Array.from(new Set([...(Array.isArray(asObject(current.data_quality).missing_blocks) ? asObject(current.data_quality).missing_blocks as string[] : []), "frozen_analytics_v2"])),
        },
      };
    }
    return {
      ...emptyAnalytics,
      data_quality: { overall: "partial", sources: { frozen_snapshot: { status: frozen.available ? (frozen.partial ? "partial" : "frozen") : "missing" } }, missing_blocks: ["frozen_analytics_v2"] },
    };
  }
  return Object.keys(asObject(current)).length ? current : (Object.keys(frozenAnalytics).length ? frozenAnalytics : current);
}

function isAfterTipoffStatus(status?: string | null): boolean {
  return ["live", "inprogress", "in_progress", "playing", "finished", "final", "closed"].includes(String(status || "").toLowerCase());
}

function mergeQuality(quality: ApiObject | null | undefined, signals: SignalResponse, frozen: FrozenPrematchResponse): ApiObject {
  const base = asObject(quality);
  const sources = { ...asObject(base.sources) };
  sources.signals = { status: signals.available === false ? "error" : signals.count > 0 ? "ok" : "empty" };
  sources.frozen_snapshot = { status: frozen.available ? (frozen.partial ? "partial" : "frozen") : "missing" };
  return { ...base, sources };
}

function MatchHero({ match }: { match: MatchDetailResponse }) {
  return (
    <header className="matchHero">
      <div>
        <div className="heroMeta">
          <span className="league">{match.league || "Basketball"}</span>
          <span>{formatMatchDate(match.game_date)} · {formatMatchTime(match.game_date)}</span>
        </div>
        <h1>{match.home_team || "Home"} vs {match.away_team || "Away"}</h1>
      </div>
      <div className="scoreBoard">
        <MatchHeroScore match={match} />
      </div>
    </header>
  );
}

function ModelBoard({ models }: { models: FrozenPrematchResponse["models"] }) {
  const source = models || {};
  const rows = ([
    ["M2", source.m2],
    ["M4", source.m4],
    ["Consensus", source.consensus || source.nbl1_core],
  ] as Array<[string, unknown]>).filter(([, value]) => value);
  if (!rows.length) return <div className="emptyCard">Model board is unavailable.</div>;
  return (
    <div className="modelGrid">
      {rows.map(([label, raw]) => {
        const item = asObject(raw);
        return (
          <div className="metricCard modelCard" key={String(label)}>
            <span>{label}</span>
            <strong>{formatNum(asNumber(item.total ?? item.total_projection), 1)}</strong>
            <small>{formatNum(asNumber(item.home ?? item.home_projection), 1)} : {formatNum(asNumber(item.away ?? item.away_projection), 1)}</small>
          </div>
        );
      })}
    </div>
  );
}

function TopRecommendationsSection({ analytics, recs }: { analytics: MatchAnalyticsResponse; recs: RecommendationsResponse }) {
  const derived = (analytics.recommendation_candidates || []).map(asObject);
  const published = (recs.items || []).slice(0, 3);
  const top = derived.filter((row) => ["PLAY", "LEAN", "PROFILE_LEAN", "WATCH"].includes(String(row.status))).slice(0, 5);
  return (
    <section className="panel" id="top-recommendations">
      <div className="panelHeader">
        <h2>PREMATCH Bets</h2>
        <StatusPill label={`${published.length} PUBLIC · ${top.length} CANDIDATES`} tone={top.length ? "green" : "neutral"} />
      </div>
      {top.length ? (
        <div className="recommendationGrid">
          {top.map((row, index) => <RecommendationCandidateCard row={row} key={`${String(row.market)}-${String(row.side)}-${index}`} />)}
        </div>
      ) : (
        <div className="emptyCard">No safe prematch recommendation candidates. Check matrix conflicts and data quality below.</div>
      )}
      {published.length ? <RecommendationTable items={published} /> : null}
    </section>
  );
}

function RecommendationCandidateCard({ row }: { row: ApiObject }) {
  const reasons = Array.isArray(row.reason_codes) ? row.reason_codes.map(String).join(" · ") : "";
  const risks = Array.isArray(row.risk_codes) ? row.risk_codes.map(String).join(" · ") : "";
  return (
    <div className={`marketMini recCard rec-${String(row.status || "pass").toLowerCase()}`}>
      <span>{marketLabel(String(row.market || "-"))} · {String(row.side || "-").toUpperCase()}</span>
      <strong>{String(row.pick || "-")} {formatNum(asNumber(row.line), 1)}</strong>
      <small>{String(row.status || "PASS")} · score {formatNum(asNumber(row.score), 2)}</small>
      <small>proj {formatNum(asNumber(row.projection), 1)} · edge {formatNum(asNumber(row.edge), 1)} · {String(row.source || "-")}</small>
      {reasons ? <small>{reasons}</small> : null}
      {risks ? <small className="riskText">{risks}</small> : null}
    </div>
  );
}

function ProjectionMatrixSection({ analytics }: { analytics: MatchAnalyticsResponse }) {
  const rows = (analytics.projection_matrix?.rows || []).map(asObject);
  const conflicts = rows.filter((row) => row.source_conflict);
  return (
    <section className="panel" id="projection-matrix">
      <div className="panelHeader">
        <h2>Small Market Matrix</h2>
        <StatusPill label={`${rows.length} MARKETS · ${conflicts.length} CONFLICTS`} tone={conflicts.length ? "purple" : "neutral"} />
      </div>
      {!rows.length ? <div className="emptyCard">Projection matrix unavailable.</div> : null}
      <div className="tableScroller">
        <table className="comparisonTable compactTable matrixTable">
          <thead>
            <tr><th>Market</th><th>Side</th><th>Line</th><th>Pick</th><th>Model</th><th>Profile L3/L5/L10/S</th><th>Venue/H2H</th><th>Hit L5/L10/H2H</th><th>Edge</th><th>Status</th><th>Risk</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 40).map((row, index) => {
              const models = asObject(row.model_projections);
              const profiles = asObject(row.profile_projections);
              const hit = asObject(row.hit_rates);
              return (
                <tr className={row.source_conflict ? "conflictRow" : ""} key={String(row.key || index)}>
                  <td>{marketLabel(String(row.market || "-"))}</td>
                  <td>{String(row.side || "-").toUpperCase()}</td>
                  <td>{formatNum(asNumber(row.line), 1)}</td>
                  <td>{String(row.pick || "-")}</td>
                  <td>{formatProjectionList(models, ["shot_model", "consensus", "calculation"])}</td>
                  <td>{formatProjectionList(profiles, ["last3", "last5", "last10", "season"])}</td>
                  <td>{formatProjectionList(profiles, ["venue", "h2h"])}</td>
                  <td>{formatHitRates(hit)}</td>
                  <td>{formatNum(asNumber(row.edge), 1)}</td>
                  <td>{String(row.recommendation_status || "-")}</td>
                  <td>{row.source_conflict ? "MODEL/PROFILE" : String(row.sample_quality || "-").toUpperCase()}</td>
                </tr>
              );
            })}
            {!rows.length ? <tr><td colSpan={11}>No matrix rows.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MainMarketsSection({ markets, models }: { markets: ApiObject | null | undefined; models: FrozenPrematchResponse["models"] }) {
  const rows = normalizePrematchMarkets(markets, models);
  const winner = asObject(asObject(markets).winner);
  const spread = rows.find((row) => row.key === "spread");
  const homeTotal = rows.find((row) => row.key === "it_home");
  const awayTotal = rows.find((row) => row.key === "it_away");
  const total = rows.find((row) => row.key === "total");
  const homeLine = spread?.line ?? null;
  const awayLine = homeLine == null ? null : -homeLine;
  return (
    <section className="panel" id="main-markets">
      <div className="panelHeader"><h2>Main Markets</h2><StatusPill label="BOOK VS MODEL" tone="neutral" /></div>
      <div className="mainMarketTop">
        <div className="marketMini winnerSpreadCard">
          <span>Winner / Spread</span>
          <strong>W1 {formatNum(asNumber(winner.home_odds), 2)} / {formatSigned(homeLine)} ({formatNum(spread?.overOdds, 2)})</strong>
          <strong>W2 {formatNum(asNumber(winner.away_odds), 2)} / {formatSigned(awayLine)} ({formatNum(spread?.underOdds, 2)})</strong>
          <small>{String(winner.status || "missing")}</small>
        </div>
        {spread ? <FeaturedSpread row={spread} /> : null}
        <ModelBoard models={models} />
      </div>
      <div className="marketGrid totalsGrid">
        {[homeTotal, awayTotal, total].filter(Boolean).map((row) => <MarketMini row={row!} key={row!.key} />)}
      </div>
    </section>
  );
}

function FeaturedSpread({ row }: { row: ReturnType<typeof normalizePrematchMarkets>[number] }) {
  return (
    <div className="marketMini featuredMarket">
      <span>SPREAD HOME {formatSigned(row.line)}</span>
      <strong>{row.pick || "-"}</strong>
      <small>proj {formatNum(row.projection, 1)} · edge {formatNum(row.edge, 1)}</small>
    </div>
  );
}

function MarketMini({ row }: { row: ReturnType<typeof normalizePrematchMarkets>[number] }) {
  const label = row.key === "it_home" ? "Home total" : row.key === "it_away" ? "Away total" : row.label;
  return (
    <div className="marketMini">
      <span>{label}</span>
      <strong>{formatNum(row.line, 1)}</strong>
      <small>O {formatNum(row.overOdds, 2)} / U {formatNum(row.underOdds, 2)}</small>
      <small>proj {formatNum(row.projection, 1)} · edge {formatNum(row.edge, 1)}</small>
      <small>{row.pick || "-"} · {row.status}</small>
    </div>
  );
}

function TeamFormSection({ analytics, match }: { analytics: MatchAnalyticsResponse; match: MatchDetailResponse }) {
  const profiles = asObject(analytics.team_profiles);
  const reason = !Object.keys(profiles).length ? "Team profile source unavailable for this match." : null;
  return (
    <section className="panel" id="team-form">
      <div className="panelHeader"><h2>Team Form</h2><StatusPill label="LAST 3 / 5 / 10 / SEASON" tone="neutral" /></div>
      {reason ? <div className="emptyCard">{reason}</div> : null}
      <div className="teamGrid teamFormList">
        <TeamCard side="Home" name={match.home_team || "Home"} profile={asObject(profiles.home)} />
        <TeamCard side="Away" name={match.away_team || "Away"} profile={asObject(profiles.away)} />
      </div>
      <TeamRecentGamesTable title="H2H Games" games={Array.isArray(analytics.h2h_games) ? analytics.h2h_games.map(asObject) : []} />
    </section>
  );
}

function TeamCard({ side, name, profile }: { side: string; name: string; profile: ApiObject }) {
  const allWindows = asObject(profile.windows);
  const splits = ["overall", "home", "away"].map((key) => [key, asObject(allWindows[key])] as const);
  const group = `team-form-${side.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="teamCard">
      <div className="panelHeader"><h3>{name}</h3><span className="league">{side}</span></div>
      <div className="splitTabs">
        {splits.map(([key, value], index) => (
          <label key={key}>
            <input type="radio" name={group} defaultChecked={index === 0} />
            <span>{key.toUpperCase()} {formatNum(asNumber(asObject(value.last5).games), 0)}</span>
          </label>
        ))}
      </div>
      {splits.map(([key, windows]) => <TeamSplitTable key={key} splitKey={key} windows={windows} />)}
      <TeamRecentGamesTable title="Recent Games" games={Array.isArray(profile.recent_games) ? profile.recent_games.map(asObject) : []} />
    </div>
  );
}

function TeamSplitTable({ splitKey, windows }: { splitKey: string; windows: ApiObject }) {
  const rows = ["last3", "last5", "last10", "season"].map((key) => [key, asObject(windows[key])] as const);
  return (
    <div className={`tableScroller teamSplitTable teamSplit-${splitKey}`}>
      <table className="comparisonTable compactTable">
        <thead><tr><th>Window</th><th>PF</th><th>PA</th><th>Total</th><th>Margin</th><th>Win%</th><th>2PM</th><th>2PA</th><th>3PM</th><th>3PA</th><th>REB</th><th>AST</th><th>TOV</th><th>Fouls</th><th>PF SD</th><th>Total SD</th><th>Sample</th></tr></thead>
        <tbody>
          {rows.map(([key, row]) => (
            <tr key={key}>
              <td>{windowLabel(key)}</td>
              <td>{formatNum(asNumber(row.points), 1)}</td>
              <td>{formatNum(asNumber(row.opp_points), 1)}</td>
              <td>{formatNum(asNumber(row.total), 1)}</td>
              <td>{formatNum(asNumber(row.margin), 1)}</td>
              <td>{formatPct(asNumber(row.win_rate))}</td>
              <td>{formatNum(asNumber(row.two_pm), 1)}</td>
              <td>{formatNum(asNumber(row.two_pa), 1)}</td>
              <td>{formatNum(asNumber(row.fg3m), 1)}</td>
              <td>{formatNum(asNumber(row.fg3a), 1)}</td>
              <td>{formatNum(asNumber(row.reb), 1)}</td>
              <td>{formatNum(asNumber(row.ast), 1)}</td>
              <td>{formatNum(asNumber(row.tov), 1)}</td>
              <td>{formatNum(asNumber(row.fouls), 1)}</td>
              <td>{formatNum(asNumber(row.points_sd), 1)}</td>
              <td>{formatNum(asNumber(row.total_sd), 1)}</td>
              <td>{formatNum(asNumber(row.games), 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamRecentGamesTable({ title, games }: { title: string; games: ApiObject[] }) {
  return (
    <div className="teamHistory">
      <div className="subHeader">{title}</div>
      <div className="tableScroller">
        <table className="comparisonTable compactTable">
          <thead><tr><th>Date</th><th>Side</th><th>Opponent</th><th>Score</th><th>Win</th><th>Spread</th><th>IT</th><th>Total</th><th>Q1</th><th>H1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>H2</th><th>2PM/A</th><th>3PM/A</th><th>REB</th><th>AST</th><th>TOV</th><th>Fouls</th></tr></thead>
          <tbody>
            {games.slice(0, 10).map((game, index) => (
              <tr key={String(game.game_id || index)}>
                <td>{shortDate(game.date)}</td>
                <td>{String(game.side || "-").toUpperCase()}</td>
                <td>{String(game.opponent || "-")}</td>
                <td>{formatNum(asNumber(game.points), 0)}:{formatNum(asNumber(game.opp_points), 0)}</td>
                <td>{game.win === true ? "WIN" : game.win === false ? "LOSS" : "-"}</td>
                <td>{formatSigned(asNumber(game.handicap))} · {String(game.spread_result || "-")}</td>
                <td>{formatNum(asNumber(game.team_total_line), 1)} · {String(game.team_total_result || "-")}</td>
                <td>{formatNum(asNumber(game.total_line), 1)} · {String(game.total_result || "-")}</td>
                <td className="periodCell">{periodLabel(game.q1_label, game.q1_win)}</td>
                <td className="periodCell">{periodLabel(game.h1_label, game.h1_win)}</td>
                <td className="periodCell">{periodLabel(game.q2_label, game.q2_win)}</td>
                <td className="periodCell">{periodLabel(game.q3_label, game.q3_win)}</td>
                <td className="periodCell">{periodLabel(game.q4_label, game.q4_win)}</td>
                <td className="periodCell">{periodLabel(game.h2_label, game.h2_win)}</td>
                <td>{formatNum(asNumber(game.two_pm), 0)}/{formatNum(asNumber(game.two_pa), 0)}</td>
                <td>{formatNum(asNumber(game.fg3m), 0)}/{formatNum(asNumber(game.fg3a), 0)}</td>
                <td>{statPair(game.reb_pair, game.reb)}</td>
                <td>{statPair(game.ast_pair, game.ast)}</td>
                <td>{statPair(game.tov_pair, game.tov)}</td>
                <td>{statPair(game.fouls_pair, game.fouls)}</td>
              </tr>
            ))}
            {!games.length ? <tr><td colSpan={20}>Recent game history unavailable.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeriodsSection({ analytics, prematch, frozen }: { analytics: MatchAnalyticsResponse; prematch: PrematchResponse; frozen: FrozenPrematchResponse }) {
  const periodMarkets = asObject(analytics.markets?.periods);
  const periodProfiles = asObject(analytics.period_profiles);
  const periods = Object.keys(periodMarkets).length ? Object.entries(periodMarkets).map(([key, raw]) => {
    const block = asObject(raw);
    return {
      label: key.toUpperCase(),
      block,
      profile: asObject(periodProfiles[key]),
    };
  }) : getQuarterProfiles(frozen, prematch).map((row) => ({
    label: row.label,
    block: asObject({ total: { line: row.line, projection: row.projection, edge: row.edge, status: "available" } }),
    profile: asObject({ sample: row.sampleSize }),
  }));
  return (
    <section className="panel" id="periods">
      <div className="panelHeader"><h2>Periods</h2><StatusPill label="Q1 / H1" tone="purple" /></div>
      {!periods.length ? <div className="emptyCard">Period markets unavailable</div> : null}
      <div className="quarterGrid">
        {periods.map((period) => (
          <div className="metricCard" key={period.label}>
            <span>{period.label}</span>
            <PeriodMarketLine label="Winner" block={asObject(period.block.winner)} winner />
            <PeriodMarketLine label="Spread" block={asObject(period.block.spread)} />
            <PeriodMarketLine label="Total" block={asObject(period.block.total)} />
            <PeriodMarketLine label="IT Home" block={asObject(asObject(period.block.team_totals).home)} />
            <PeriodMarketLine label="IT Away" block={asObject(asObject(period.block.team_totals).away)} />
            <small>sample {formatNum(asNumber(period.profile.sample), 0)} · {String(period.profile.projection_source || "line_only")}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function PeriodMarketLine({ label, block, winner = false }: { label: string; block: ApiObject; winner?: boolean }) {
  if (winner) {
    return (
      <div className="periodMarketRow">
        <span>{label}</span>
        <strong>W1 {formatNum(asNumber(block.home_odds), 2)} / W2 {formatNum(asNumber(block.away_odds), 2)}</strong>
        <small>{String(block.status || "missing")}</small>
      </div>
    );
  }
  const line = asNumber(block.line ?? block.home_line);
  const status = String(block.pick || block.status || "line_only").replace(/_/g, " ").toUpperCase();
  return (
    <div className="periodMarketRow">
      <span>{label}</span>
      <strong>{formatNum(line, 1)}</strong>
      <small>proj {formatNum(asNumber(block.projection), 1)} · edge {formatNum(asNumber(block.edge), 1)} · {status}</small>
    </div>
  );
}

function TeamStatsSection({ analytics }: { analytics: MatchAnalyticsResponse }) {
  const stats = asObject(analytics.markets?.team_stats);
  const rows = Object.entries(stats).flatMap(([market, sides]) => Object.entries(asObject(sides)).map(([side, raw]) => ({ market, side, raw: asObject(raw) })));
  return (
    <section className="panel" id="team-stats">
      <div className="panelHeader"><h2>Team Stats</h2><StatusPill label="BOOKMAKER LINES" tone="neutral" /></div>
      {!rows.length ? <div className="emptyCard">Team stat bookmaker lines unavailable for this match.</div> : null}
      <div className="marketGrid">
        {rows.map(({ market, side, raw }) => (
          <div className="marketMini" key={`${market}-${side}`}>
            <span>{marketLabel(market)} · {side.toUpperCase()}</span>
            <strong>{formatNum(asNumber(raw.line), 1)}</strong>
            <small>O {formatNum(asNumber(raw.odds_over), 2)} / U {formatNum(asNumber(raw.odds_under), 2)}</small>
            <small>proj {formatNum(asNumber(raw.projection), 1)} · edge {formatNum(asNumber(raw.edge), 1)}</small>
            <small>{String(raw.pick || "-")} · {String(raw.projection_source || raw.status || "line_only")}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShotMarketsSection({ analytics, prematch, frozen }: { analytics: MatchAnalyticsResponse; prematch: PrematchResponse; frozen: FrozenPrematchResponse }) {
  const rows = shotMarketRows(analytics.markets?.shots || frozen.shot_markets || prematch.shot_markets);
  return (
    <section className="panel" id="shots">
      <div className="panelHeader"><h2>Shots</h2><StatusPill label="2PM / 3PM" tone="purple" /></div>
      <div className="shotGrid">
        {rows.map((row) => (
          <div className="shotCard" key={row.label}>
            <span>{row.label}</span>
            <strong>{formatNum(row.projection, 1)}</strong>
            <small>line {formatNum(row.line, 1)} · edge {formatNum(row.edge, 1)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlayersSection({ analytics, prematch }: { analytics: MatchAnalyticsResponse; prematch: PrematchResponse }) {
  const lineups = asObject(analytics.lineups);
  const profiles = analytics.player_profiles || [];
  const props = analytics.player_props || [];
  const playerFeedMissing = !profiles.length;
  const homePlayers = playersForTeam(profiles, "home", lineups, prematch);
  const awayPlayers = playersForTeam(profiles, "away", lineups, prematch);
  return (
    <section className="panel" id="players">
      <div className="panelHeader">
        <h2>Players</h2>
        <StatusPill label={playerFeedMissing ? "PLAYER ANALYTICS MISSING" : `${profiles.length} PROFILES`} tone={playerFeedMissing ? "neutral" : "green"} />
      </div>
      <div className="teamGrid">
        <LineupCard side="home" lineups={lineups} prematch={prematch} />
        <LineupCard side="away" lineups={lineups} prematch={prematch} />
      </div>
      {playerFeedMissing ? <div className="emptyCard">Player analytics unavailable. Lineups can still render when lineup feed is present.</div> : null}
      <div className="playersByTeam">
        <PlayerProfileTable title="Home Player Profiles" players={homePlayers} />
        <PlayerProfileTable title="Away Player Profiles" players={awayPlayers} />
      </div>
      <div className="tableScroller">
        <table className="comparisonTable">
          <thead><tr><th>Prop</th><th>Market</th><th>Pick</th><th>Line</th><th>Odds</th><th>Projection</th><th>Edge</th><th>Status</th><th>Source</th></tr></thead>
          <tbody>
            {props.slice(0, 20).map((raw, index) => {
              const prop = asObject(raw);
              return <tr key={`${String(prop.player)}-${String(prop.market)}-${index}`}><td>{String(prop.player || "-")}</td><td>{String(prop.market || "-")}</td><td>{String(prop.pick || "-")}</td><td>{formatNum(asNumber(prop.line), 1)}</td><td>O {formatNum(asNumber(prop.odds_over), 2)} / U {formatNum(asNumber(prop.odds_under), 2)}</td><td>{formatNum(asNumber(prop.projection), 1)}</td><td>{formatNum(asNumber(prop.edge), 1)}</td><td>{String(prop.confidence || "LINE_ONLY")}</td><td>{String(prop.projection_source || "-")}</td></tr>;
            })}
            {!props.length ? <tr><td colSpan={9}>Player props unavailable.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PlayerProfileTable({ title, players }: { title: string; players: ApiObject[] }) {
  return (
    <div className="teamHistory">
      <div className="subHeader">{title}</div>
      <div className="tableScroller">
        <table className="comparisonTable compactTable">
          <thead><tr><th>Player</th><th>Role</th><th>Min</th><th>USG%</th><th>Off</th><th>Def</th><th>Net</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th></tr></thead>
          <tbody>
            {players.map((p, index) => {
              const last5 = asObject(asObject(p.windows).last5);
              return <tr key={String(p.player_id || p.name || index)}><td>{String(p.name || "-")}</td><td>{String(p.role_type || "-")}</td><td>{formatNum(asNumber(p.minutes ?? last5.minutes), 1)}</td><td>{formatNum(asNumber(p.usage ?? last5.usage), 1)}</td><td>{formatNum(asNumber(p.off_rtg), 1)}</td><td>{formatNum(asNumber(p.def_rtg), 1)}</td><td>{formatNum(asNumber(p.net_rtg), 1)}</td><td>{formatNum(asNumber(last5.points), 1)}</td><td>{formatNum(asNumber(last5.rebounds), 1)}</td><td>{formatNum(asNumber(last5.assists), 1)}</td><td>{formatNum(asNumber(last5.three_pm), 1)}</td></tr>;
            })}
            {!players.length ? <tr><td colSpan={11}>Player profiles unavailable.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function playersForTeam(profiles: ApiObject[], side: "home" | "away", lineups: ApiObject, prematch: PrematchResponse): ApiObject[] {
  const lineup = asObject(lineups[side]);
  const lineupPlayers = [
    ...(Array.isArray(lineup.starters) ? lineup.starters : []),
    ...(Array.isArray(lineup.bench) ? lineup.bench : []),
    ...(prematch.players?.[side] || []),
  ].map(asObject);
  const ids = new Set(lineupPlayers.map((player) => String(player.player_id || "")).filter(Boolean));
  const names = new Set(lineupPlayers.map((player) => String(player.name || player.player_name || "").toLowerCase()).filter(Boolean));
  const filtered = profiles.map(asObject).filter((player) => {
    const playerId = String(player.player_id || "");
    const name = String(player.name || "").toLowerCase();
    return ids.has(playerId) || names.has(name) || (!ids.size && !names.size && sideFromTeamCode(player.team_tricode, player.team) === side);
  });
  return filtered.sort((a, b) => (asNumber(b.minutes) || 0) - (asNumber(a.minutes) || 0));
}

function sideFromTeamCode(_teamTricode: unknown, _team: unknown): "home" | "away" | null {
  return null;
}

function LineupCard({ side, lineups, prematch }: { side: "home" | "away"; lineups: ApiObject; prematch: PrematchResponse }) {
  const lineup = asObject(lineups[side]);
  const starters = Array.isArray(lineup.starters) ? lineup.starters.map(asObject) : [];
  const bench = Array.isArray(lineup.bench) ? lineup.bench.map(asObject) : [];
  const out = Array.isArray(lineup.out) ? lineup.out.map(asObject) : [];
  const fallbackPlayers = prematch.players?.[side] || [];
  const hasLineup = Boolean(starters.length || bench.length || out.length);
  return (
    <div className="teamCard">
      <div className="panelHeader"><h3>{side.toUpperCase()} Lineup</h3><StatusPill label={String(lineup.lineup_type || (hasLineup ? "partial" : "missing")).toUpperCase()} tone={hasLineup ? "green" : "neutral"} /></div>
      {!hasLineup && fallbackPlayers.length ? <div className="emptyCard">Roster only. Confirmed lineup feed unavailable.</div> : null}
      <PlayerPills title="Starters" players={starters} />
      <PlayerPills title="Bench" players={bench.length ? bench : fallbackPlayers.map((player) => player as unknown as ApiObject)} />
      <PlayerPills title="Out / Injured" players={out} />
    </div>
  );
}

function EndpointNotice({ label, error }: { label: string; error: string }) {
  return <div className="stateBox danger endpointNotice">{label} temporarily unavailable: {error}</div>;
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <div className="metricCard"><span>{label}</span><strong>{value}</strong></div>;
}

function RailCard({ title, rows }: { title: string; rows: Array<[string, ReactNode]> }) {
  return <div className="railCard"><h3>{title}</h3>{rows.map(([k, v]) => <div className="railRow" key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>;
}

function qualityRows(...sources: Array<ApiObject | null | undefined>): Array<[string, ReactNode]> {
  const analyticsQuality = asObject(sources[0]);
  const structured = asObject(analyticsQuality.sources);
  if (Object.keys(structured).length) {
    return [
      ["Overall", String(analyticsQuality.overall || "-").toUpperCase()],
      ["Match DB", sourceStatus(structured.match_db)],
      ["Calculation", sourceStatus(structured.calculation, "source")],
      ["Bookmaker", sourceStatus(structured.bookmaker)],
      ["Team profiles", sourceStatus(structured.team_profiles)],
      ["Player profiles", sourceStatus(structured.player_profiles, "count")],
      ["Lineups", sourceStatus(structured.lineups)],
      ["Signals", sourceStatus(structured.signals)],
      ["Snapshot", sourceStatus(structured.frozen_snapshot)],
    ];
  }
  const seen = new Set<string>();
  return sources.flatMap((source) => Object.entries(asObject(source))).flatMap(([key, value]) => {
    if (key === "redis" && value === "not_required") return [];
    if (seen.has(key)) return [];
    seen.add(key);
    return [[key, String(value)] as [string, string]];
  }).slice(0, 9);
}

function sourceStatus(value: unknown, detailKey?: string): string {
  const source = asObject(value);
  const rawStatus = String(source.status || "-").toLowerCase();
  const status = ({ separate_endpoint: "OK", ok: "OK", empty: "EMPTY", error: "ERROR", frozen: "FROZEN", partial: "PARTIAL", missing: "MISSING" } as Record<string, string>)[rawStatus] || rawStatus.toUpperCase();
  if (!detailKey) return status;
  const detail = source[detailKey];
  return detail == null ? status : `${status} ${String(detail).toUpperCase()}`;
}

function PlayerPills({ title, players }: { title: string; players: ApiObject[] }) {
  return (
    <div className="playerListBlock">
      <strong>{title}</strong>
      <div className="playerList">
        {players.slice(0, 10).map((player, index) => <span key={String(player.player_id || player.name || index)}>{String(player.name || player.player_name || "-")} {player.position ? `· ${String(player.position)}` : ""}</span>)}
        {!players.length ? <span>Unavailable</span> : null}
      </div>
    </div>
  );
}

function windowLabel(key: string): string {
  return ({ last3: "Last 3", last5: "Last 5", last10: "Last 10", season: "Season" } as Record<string, string>)[key] || key;
}

function marketLabel(key: string): string {
  return key.split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}

function formatProjectionList(source: ApiObject, keys: string[]): string {
  const parts = keys
    .map((key) => {
      const value = asNumber(source[key]);
      return value == null ? null : `${key.replace("last", "L").toUpperCase()} ${formatNum(value, 1)}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "-";
}

function formatHitRates(source: ApiObject): string {
  const parts = ["last5", "last10", "h2h"].map((key) => {
    const block = asObject(source[key]);
    const hit = asNumber(block.pick_hit_rate);
    return hit == null ? null : `${key.toUpperCase()} ${formatPct(hit)}`;
  }).filter(Boolean);
  return parts.length ? parts.join(" · ") : "-";
}

function formatSigned(value: number | null | undefined): string {
  if (value == null) return "-";
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function periodResult(value: unknown): string {
  if (value === true) return "WIN";
  if (value === false) return "LOSS";
  if (String(value).toLowerCase() === "win") return "WIN";
  if (String(value).toLowerCase() === "loss") return "LOSS";
  if (String(value).toLowerCase() === "push") return "PUSH";
  return "-";
}

function periodLabel(label: unknown, fallback: unknown): string {
  if (label) return String(label);
  return periodResult(fallback);
}

function statPair(pair: unknown, fallback: unknown): string {
  if (pair) return String(pair);
  return formatNum(asNumber(fallback), 0);
}

function shortDate(value: unknown): string {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

import type { ReactNode } from "react";

import { ApiUnavailable } from "@/components/ApiUnavailable";
import { LiveMatchCenter, LiveMatchProvider, LiveResultComparison, MatchHeroScore, SignalSummaryRail } from "@/components/match/LiveMatchCenter";
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
  ["overview", "Overview"],
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
  const modelSource = displayAnalytics.models || frozen.models || (!afterTipoff ? prematch.models || (asObject(match.model_summary) as FrozenPrematchResponse["models"]) : {}) || {};
  const marketSource = asObject(displayAnalytics.markets?.main || frozen.markets || (!afterTipoff ? prematch.market || match.market : {}));
  const endpointErrors = [
    ["Prematch", prematchResult.error],
    ["Postgame", postgameResult.error],
    ["Recommendations", recsResult.error],
    ["Frozen prematch", frozenResult.error],
    ["Analytics", analyticsResult.error],
    ["Signals", signalsResult.error],
  ].filter(([, error]) => error);

  return (
    <LiveMatchProvider gameId={gameId} initialLive={liveSeed} initialSignals={initialSignals} initialStatus={match.status}>
    <section className="matchPage">
      <MatchHero match={match} />
      <nav className="tabsRow stickyTabs" aria-label="Match sections">
        {tabs.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
      </nav>

      <section className="matchLayout">
        <div className="matchMain">
          {endpointErrors.map(([label, error]) => <EndpointNotice key={label} label={label || "Endpoint"} error={error || ""} />)}
          <OverviewSection prematch={prematch} frozen={frozen} frozenItems={frozenItems} models={modelSource} analytics={displayAnalytics} matchStatus={match.status} />
          <LiveMatchCenter />
          <MainMarketsSection markets={marketSource} models={modelSource} />
          <PeriodsSection analytics={displayAnalytics} prematch={prematch} frozen={frozen} />
          <TeamStatsSection analytics={displayAnalytics} />
          <ShotMarketsSection analytics={displayAnalytics} prematch={prematch} frozen={frozen} />
          <TeamFormSection analytics={displayAnalytics} match={match} />
          <PlayersSection analytics={displayAnalytics} prematch={prematch} />
          <section className="panel" id="recommendations">
            <div className="panelHeader">
              <h2>Recommendations</h2>
              <StatusPill label={`${recs.count} PUBLIC`} tone="neutral" />
            </div>
            <RecommendationTable items={recs.items} />
          </section>
          <LiveResultComparison
            initialPostgame={postgame}
            match={match}
            frozenItems={frozenItems}
            ledgerItems={recs.items}
          />
        </div>

        <aside className="matchRail">
          <RailCard title="Data Quality" rows={qualityRows(mergeQuality(displayAnalytics.data_quality, initialSignals, frozen), match.data_quality, prematch.data_quality, frozen.data_quality)} />
          <RailCard title="Model State" rows={[
            ["Source", displayAnalytics.calculation_source || frozen.calculation_source || prematch.calculation_source || match.calculation_source || "-"],
            ["Roster", frozen.roster_state || prematch.roster_state || match.roster_state || "-"],
            ["Revision", frozen.revision || displayAnalytics.calculation_revision || frozen.calculation_revision || prematch.calculation_revision || match.calculation_revision || "-"],
          ]} />
          <SignalSummaryRail settledSummary={postgame.signals_summary} />
        </aside>
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

function selectDisplayAnalytics(match: MatchDetailResponse, current: MatchAnalyticsResponse, frozen: FrozenPrematchResponse): MatchAnalyticsResponse {
  const frozenAnalytics = asObject(frozen.analytics_v2 || frozen.analytics) as MatchAnalyticsResponse;
  const afterTipoff = isAfterTipoffStatus(match.status);
  if (afterTipoff) {
    return Object.keys(frozenAnalytics).length ? { ...frozenAnalytics, data_quality: frozenAnalytics.data_quality || frozen.data_quality } : {
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

function OverviewSection({
  prematch,
  frozen,
  frozenItems,
  models,
  analytics,
  matchStatus,
}: {
  prematch: PrematchResponse;
  frozen: FrozenPrematchResponse;
  frozenItems: RecommendationsResponse["items"];
  models: FrozenPrematchResponse["models"];
  analytics: MatchAnalyticsResponse;
  matchStatus?: string | null;
}) {
  const legacyFrozen = frozen.available && frozen.analytics_v2_available === false;
  return (
    <section className="panel" id="overview">
      <div className="panelHeader">
        <h2>Overview</h2>
        <StatusPill label={frozenBadgeLabel(frozen, matchStatus)} tone={frozen.partial ? "purple" : "green"} />
      </div>
      {legacyFrozen ? <div className="stateBox">Historical advanced analytics unavailable.</div> : null}
      <div className="metricGrid compactMetrics">
        <Metric label="Snapshot" value={frozen.snapshot_at || "-"} />
        <Metric label="Revision" value={frozen.revision || prematch.calculation_revision || "-"} />
        <Metric label="Source" value={(analytics.calculation_source || frozen.calculation_source || prematch.calculation_source || "-").toUpperCase()} />
        <Metric label="Calculation" value={analytics.calculation_revision || frozen.calculation_revision || prematch.calculation_revision || "-"} />
        <Metric label="Analytics hash" value={frozen.analytics_v2_hash || "-"} />
        <Metric label="Roster" value={frozen.roster_state || prematch.roster_state || "-"} />
      </div>
      <ModelBoard models={models} />
      <RecommendationTable items={frozenItems} />
    </section>
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

function MainMarketsSection({ markets, models }: { markets: ApiObject | null | undefined; models: FrozenPrematchResponse["models"] }) {
  const rows = normalizePrematchMarkets(markets, models);
  const winner = asObject(asObject(markets).winner);
  return (
    <section className="panel" id="main-markets">
      <div className="panelHeader"><h2>Main Markets</h2><StatusPill label="BOOK VS MODEL" tone="neutral" /></div>
      <div className="marketGrid">
        <div className="marketMini">
          <span>Winner</span>
          <strong>W1 {formatNum(asNumber(winner.home_odds), 2)} / W2 {formatNum(asNumber(winner.away_odds), 2)}</strong>
          <small>{String(winner.status || "missing")}</small>
        </div>
      </div>
      <div className="marketGrid">
        {rows.map((row) => (
          <div className="marketMini" key={row.key}>
            <span>{row.label}</span>
            <strong>{formatNum(row.line, 1)}</strong>
            <small>O {formatNum(row.overOdds, 2)} / U {formatNum(row.underOdds, 2)}</small>
            <small>proj {formatNum(row.projection, 1)} · edge {formatNum(row.edge, 1)}</small>
            <small>{row.pick || "-"} · {row.status}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamFormSection({ analytics, match }: { analytics: MatchAnalyticsResponse; match: MatchDetailResponse }) {
  const profiles = asObject(analytics.team_profiles);
  const reason = !Object.keys(profiles).length ? "Team profile source unavailable for this match." : null;
  return (
    <section className="panel" id="team-form">
      <div className="panelHeader"><h2>Team Form</h2><StatusPill label="LAST 3 / 5 / 10 / SEASON" tone="neutral" /></div>
      {reason ? <div className="emptyCard">{reason}</div> : null}
      <div className="teamGrid">
        <TeamCard side="Home" name={match.home_team || "Home"} profile={asObject(profiles.home)} />
        <TeamCard side="Away" name={match.away_team || "Away"} profile={asObject(profiles.away)} />
      </div>
    </section>
  );
}

function TeamCard({ side, name, profile }: { side: string; name: string; profile: ApiObject }) {
  const allWindows = asObject(profile.windows);
  const windows = asObject(allWindows.overall);
  const homeAway = ["overall", "home", "away"].map((key) => [key, asObject(allWindows[key])] as const);
  const rows = ["last3", "last5", "last10", "season"].map((key) => [key, asObject(windows[key])] as const);
  return (
    <div className="teamCard">
      <div className="panelHeader"><h3>{name}</h3><span className="league">{side}</span></div>
      <div className="statusCluster">
        {homeAway.map(([key, value]) => <StatusPill key={key} label={`${key.toUpperCase()} ${formatNum(asNumber(asObject(value.last5).games), 0)}`} tone={key === "overall" ? "green" : "neutral"} />)}
      </div>
      <div className="tableScroller">
        <table className="comparisonTable compactTable">
          <thead><tr><th>Window</th><th>PF</th><th>PA</th><th>Total</th><th>Margin</th><th>Win%</th><th>SD</th><th>Sample</th></tr></thead>
          <tbody>
            {rows.map(([key, row]) => (
              <tr key={key}>
                <td>{windowLabel(key)}</td>
                <td>{formatNum(asNumber(row.points), 1)}</td>
                <td>{formatNum(asNumber(row.opp_points), 1)}</td>
                <td>{formatNum(asNumber(row.total), 1)}</td>
                <td>{formatNum(asNumber(row.margin), 1)}</td>
                <td>{formatPct(asNumber(row.win_rate))}</td>
                <td>{formatNum(asNumber(row.total_sd), 1)}</td>
                <td>{formatNum(asNumber(row.games), 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="miniMetrics">
        <Metric label="REB" value={formatNum(asNumber(asObject(windows.last5).reb), 1)} />
        <Metric label="AST" value={formatNum(asNumber(asObject(windows.last5).ast), 1)} />
        <Metric label="TOV" value={formatNum(asNumber(asObject(windows.last5).tov), 1)} />
        <Metric label="Pace" value={formatNum(asNumber(asObject(windows.last5).pace), 1)} />
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
    return <small>{label}: W1 {formatNum(asNumber(block.home_odds), 2)} / W2 {formatNum(asNumber(block.away_odds), 2)} · {String(block.status || "missing")}</small>;
  }
  const line = asNumber(block.line ?? block.home_line);
  return <small>{label}: line {formatNum(line, 1)} · proj {formatNum(asNumber(block.projection), 1)} · edge {formatNum(asNumber(block.edge), 1)} · {String(block.pick || block.status || "line_only")}</small>;
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
      <div className="tableScroller">
        <table className="comparisonTable">
          <thead><tr><th>Player</th><th>Team</th><th>Role</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th><th>Net</th></tr></thead>
          <tbody>
            {profiles.slice(0, 16).map((raw, index) => {
              const p = asObject(raw);
              const last5 = asObject(asObject(p.windows).last5);
              return <tr key={String(p.player_id || p.name || index)}><td>{String(p.name || "-")}</td><td>{String(p.team_tricode || p.team || "-")}</td><td>{String(p.role_type || "-")}</td><td>{formatNum(asNumber(last5.points), 1)}</td><td>{formatNum(asNumber(last5.rebounds), 1)}</td><td>{formatNum(asNumber(last5.assists), 1)}</td><td>{formatNum(asNumber(last5.three_pm), 1)}</td><td>{formatNum(asNumber(p.net_rtg), 1)}</td></tr>;
            })}
            {!profiles.length ? <tr><td colSpan={8}>Player profiles unavailable.</td></tr> : null}
          </tbody>
        </table>
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

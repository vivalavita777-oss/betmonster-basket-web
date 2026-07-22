import type { ReactNode } from "react";

import { ApiUnavailable } from "@/components/ApiUnavailable";
import { LiveHeroScore, LiveMatchCenter, LiveMatchProvider, LiveResultComparison, SignalSummaryRail } from "@/components/match/LiveMatchCenter";
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
      <MatchHero match={match} markets={marketSource} />

      <section className="matchLayout">
        <div className="matchMain">
          {endpointErrors.map(([label, error]) => <EndpointNotice key={label} label={label || "Endpoint"} error={error || ""} />)}
          <div className="matchTabs">
            <input className="matchTabInput" type="radio" name="match-tabs" id="match-tab-lines" defaultChecked />
            <input className="matchTabInput" type="radio" name="match-tabs" id="match-tab-form" />
            <input className="matchTabInput" type="radio" name="match-tabs" id="match-tab-players" />
            <input className="matchTabInput" type="radio" name="match-tabs" id="match-tab-signals" />
            <input className="matchTabInput" type="radio" name="match-tabs" id="match-tab-recommendations" />
            <input className="matchTabInput" type="radio" name="match-tabs" id="match-tab-result" />
            <input className="matchTabInput" type="radio" name="match-tabs" id="match-tab-meta" />
            {liveVisible ? <input className="matchTabInput" type="radio" name="match-tabs" id="match-tab-live" /> : null}
            <nav className="matchTabNav stickyTabs" aria-label="Match sections">
              <label htmlFor="match-tab-lines">Line Markets</label>
              <label htmlFor="match-tab-form">Team Form</label>
              <label htmlFor="match-tab-players">Players</label>
              <label htmlFor="match-tab-signals">Signals</label>
              <label htmlFor="match-tab-recommendations">Recommendations</label>
              <label htmlFor="match-tab-result">Result</label>
              <label htmlFor="match-tab-meta">Meta</label>
              {liveVisible ? <label htmlFor="match-tab-live">Live</label> : null}
              <span className="tabSpacer" />
              <MatchJsonDownload payload={jsonPayload} compactPayload={compactJsonPayload} />
            </nav>
            <div className="matchTabPanels">
              <div className="matchTabPanel tabPanelLines">
                <LineMarketsSection analytics={displayAnalytics} prematch={prematch} frozen={frozen} match={match} />
              </div>
              <div className="matchTabPanel tabPanelForm">
                <TeamFormSection analytics={displayAnalytics} match={match} />
              </div>
              <div className="matchTabPanel tabPanelPlayers">
                <PlayersSection analytics={displayAnalytics} prematch={prematch} showProps={false} />
              </div>
              <div className="matchTabPanel tabPanelSignals">
                <StaticSignalsSection signals={initialSignals} />
              </div>
              <div className="matchTabPanel tabPanelRecommendations">
                <TopRecommendationsSection analytics={displayAnalytics} recs={recs} />
                <section className="panel" id="recommendations">
                  <div className="panelHeader">
                    <h2>Published Recommendations</h2>
                    <StatusPill label={`${recs.count} PREMATCH BETS`} tone="neutral" />
                  </div>
                  {recs.items.length ? <RecommendationTable items={recs.items} /> : <div className="emptyCard">No published prematch recommendations yet. See Line Markets for unvalidated model candidates.</div>}
                </section>
              </div>
              <div className="matchTabPanel tabPanelResult">
                <LiveResultComparison
                  initialPostgame={postgame}
                  match={match}
                  frozenItems={frozenItems}
                  ledgerItems={recs.items}
                  initialSignals={initialSignals}
                />
              </div>
              <div className="matchTabPanel tabPanelMeta">
                <MetaFooter
                  analytics={displayAnalytics}
                  frozen={frozen}
                  prematch={prematch}
                  match={match}
                  signals={initialSignals}
                  postgame={postgame}
                />
              </div>
              {liveVisible ? <div className="matchTabPanel tabPanelLive"><LiveMatchCenter /></div> : null}
            </div>
          </div>
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

function MatchHero({ match, markets }: { match: MatchDetailResponse; markets: ApiObject | null | undefined }) {
  const winner = asObject(asObject(markets).winner);
  const homeOdds = asNumber(winner.home_odds);
  const awayOdds = asNumber(winner.away_odds);
  return (
    <header className="matchHero">
      <div>
        <div className="heroMeta">
          <span className="league leagueChip">{match.league || "Basketball"}</span>
          <span>{formatMatchDate(match.game_date)} · {formatMatchTime(match.game_date)}</span>
        </div>
        <h1 className="matchTitleLine">
          <span>{match.home_team || "Home"}</span>
          <span className="teamOdd">{formatNum(homeOdds, 2)}</span>
          <span className="vsText">Vs</span>
          <span>{match.away_team || "Away"}</span>
          <span className="teamOdd">{formatNum(awayOdds, 2)}</span>
        </h1>
      </div>
      <LiveHeroScore match={match} />
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
  const top = derived.filter((row) => ["MODEL_PLAY_UNVALIDATED", "LEAN", "PROFILE_LEAN", "WATCH"].includes(String(row.status))).slice(0, 5);
  return (
    <section className="panel" id="top-recommendations">
      <div className="panelHeader">
        <h2>PREMATCH CANDIDATES</h2>
        <StatusPill label={`${published.length} PUBLIC BETS · ${top.length} MODEL CANDIDATES`} tone={top.length ? "green" : "neutral"} />
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
      <small>{String(row.status || "PASS")} · rank {formatNum(asNumber(row.score), 2)} · odds {formatNum(asNumber(row.odds), 2)}</small>
      <small>proj {formatNum(asNumber(row.projection), 1)} · edge {formatNum(asNumber(row.edge), 1)} · {String(row.source || "-")}</small>
      {reasons ? <small>{reasons}</small> : null}
      {risks ? <small className="riskText">{risks}</small> : null}
    </div>
  );
}

function LineMarketsSection({ analytics, prematch, frozen, match }: { analytics: MatchAnalyticsResponse; prematch: PrematchResponse; frozen: FrozenPrematchResponse; match: MatchDetailResponse }) {
  const matrixRows = (analytics.projection_matrix?.rows || []).map(asObject);
  const mainRows = matrixRows.filter(isMainMarketMatrixRow).map((row) => enrichMainMarketRow(row, analytics));
  const shotRows = matrixRows.filter((row) => ["two_pm", "three_pm"].includes(String(row.market)));
  const otherRows = matrixRows.filter((row) => !isMainMarketMatrixRow(row) && !["two_pm", "three_pm"].includes(String(row.market)));
  return (
    <section className="panel lineMarketsPanel" id="line-markets">
      <div className="panelHeader">
        <h2>Line Markets</h2>
        <StatusPill label={`${matrixRows.length} MARKET ROWS`} tone="neutral" />
      </div>
      <div className="lineSubTabs">
        <input className="matchTabInput" type="radio" name="line-market-tabs" id="line-tab-main" defaultChecked />
        <input className="matchTabInput" type="radio" name="line-market-tabs" id="line-tab-shots" />
        <input className="matchTabInput" type="radio" name="line-market-tabs" id="line-tab-other" />
        <input className="matchTabInput" type="radio" name="line-market-tabs" id="line-tab-players" />
        <nav className="subTabNav" aria-label="Line market groups">
          <label htmlFor="line-tab-main">Main & Periods</label>
          <label htmlFor="line-tab-shots">2&3 PT</label>
          <label htmlFor="line-tab-other">Other Props</label>
          <label htmlFor="line-tab-players">Player Points</label>
        </nav>
        <div className="lineTabPanels">
          <div className="lineTabPanel linePanelMain">
            <UnifiedMarketTable eyebrow="BOOK VS MODELS" title="Main Line" rows={mainRows} match={match} />
            <UnifiedMarketTable eyebrow="PERIOD LINES" title="Periods" rows={periodMarketRows(analytics, prematch, frozen)} match={match} />
          </div>
          <div className="lineTabPanel linePanelShots">
            <UnifiedMarketTable eyebrow="SHOT MARKETS" title="2 & 3 PT Market" rows={shotRows} match={match} />
          </div>
          <div className="lineTabPanel linePanelOther">
            <ProfileMarketTable eyebrow="TEAM STAT MARKETS" title="Other Props Market" rows={otherRows} match={match} />
          </div>
          <div className="lineTabPanel linePanelPlayers">
            <PlayerPointsMarketTable props={analytics.player_props || []} match={match} />
          </div>
        </div>
      </div>
    </section>
  );
}

function UnifiedMarketTable({ eyebrow, title, rows, match }: { eyebrow: string; title: string; rows: ApiObject[]; match: MatchDetailResponse }) {
  const conflicts = rows.filter((row) => row.source_conflict).length;
  return (
    <section className="sectionCard">
      <div className="sectionHeading">
        <div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div>
        <StatusPill label={`${rows.length} ROWS${conflicts ? ` · ${conflicts} CONFLICTS` : ""}`} tone={conflicts ? "purple" : "neutral"} />
      </div>
      <div className="tableScroller lineTableWrap">
        <table className="comparisonTable compactTable marketLineTable">
          <thead>
            <tr><th>Market</th><th>Side</th><th>Line</th><th>Pick</th><th>Result</th><th>M2</th><th>M4</th><th>Consensus</th><th>Profile L5/L10/H2H</th><th>Hit L5/L10/H2H</th><th>Edge L5/L10/Cons</th><th>Status</th><th>Risk</th></tr>
          </thead>
          <tbody>
            {rows.map((row, index) => <UnifiedMarketRow row={row} match={match} key={String(row.key || `${row.market}-${row.side}-${index}`)} />)}
            {!rows.length ? <tr><td colSpan={13}>No line rows available.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UnifiedMarketRow({ row, match }: { row: ApiObject; match: MatchDetailResponse }) {
  const models = asObject(row.model_projections);
  const profiles = asObject(row.profile_projections);
  const hit = asObject(row.hit_rates);
  const line = asNumber(row.line);
  const consensus = asNumber(models.consensus ?? models.shot_model ?? row.projection);
  return (
    <tr className={row.source_conflict ? "conflictRow" : ""}>
      <td><strong>{marketLabel(String(row.market || "-"))}</strong><small>{String(row.key || "")}</small></td>
      <td>{String(row.side || "-").toUpperCase()}</td>
      <td><strong>{lineText(row)}</strong><small>{oddsText(row)}</small></td>
      <td>{pickBadge(row.pick)}</td>
      <td>{resultBadge(marketResult(row, match))}</td>
      <td>{projectionEdgeCell(asNumber(models.m2), line, row)}</td>
      <td>{projectionEdgeCell(asNumber(models.m4), line, row)}</td>
      <td>{projectionEdgeCell(consensus, line, row)}</td>
      <td>{formatProjectionList(profiles, ["last5", "last10", "h2h"])}</td>
      <td>{formatHitRates(hit)}</td>
      <td>{edgeStack(profiles, consensus, line, row)}</td>
      <td><span className={`statusChip ${statusClass(row.recommendation_status || row.status)}`}>{String(row.recommendation_status || row.status || "-")}</span></td>
      <td>{riskCell(row)}</td>
    </tr>
  );
}

function ProfileMarketTable({ eyebrow, title, rows, match }: { eyebrow: string; title: string; rows: ApiObject[]; match: MatchDetailResponse }) {
  const conflicts = rows.filter((row) => row.source_conflict).length;
  return (
    <section className="sectionCard">
      <div className="sectionHeading">
        <div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div>
        <StatusPill label={`${rows.length} ROWS${conflicts ? ` · ${conflicts} CONFLICTS` : ""}`} tone={conflicts ? "purple" : "neutral"} />
      </div>
      <div className="tableScroller lineTableWrap">
        <table className="comparisonTable compactTable marketLineTable profileMarketTable">
          <thead>
            <tr><th>Market</th><th>Side</th><th>Line</th><th>Pick</th><th>Result</th><th>Profile L5/L10/H2H</th><th>Hit L5/L10/H2H</th><th>Edge L5/L10/H2H</th><th>Status</th><th>Risk</th></tr>
          </thead>
          <tbody>
            {rows.map((row, index) => <ProfileMarketRow row={row} match={match} key={String(row.key || `${row.market}-${row.side}-${index}`)} />)}
            {!rows.length ? <tr><td colSpan={10}>No profile rows available.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProfileMarketRow({ row, match }: { row: ApiObject; match: MatchDetailResponse }) {
  const profiles = asObject(row.profile_projections);
  const hit = asObject(row.hit_rates);
  const line = asNumber(row.line);
  return (
    <tr className={row.source_conflict ? "conflictRow" : ""}>
      <td><strong>{marketLabel(String(row.market || "-"))}</strong><small>{String(row.key || "")}</small></td>
      <td>{String(row.side || "-").toUpperCase()}</td>
      <td><strong>{lineText(row)}</strong><small>{oddsText(row)}</small></td>
      <td>{pickBadge(row.pick)}</td>
      <td>{resultBadge(marketResult(row, match))}</td>
      <td>{formatProjectionList(profiles, ["last5", "last10", "h2h"])}</td>
      <td>{formatHitRates(hit)}</td>
      <td>{profileEdgeStack(profiles, line, row)}</td>
      <td><span className={`statusChip ${statusClass(row.recommendation_status || row.status)}`}>{String(row.recommendation_status || row.status || "-")}</span></td>
      <td>{riskCell(row)}</td>
    </tr>
  );
}

function PlayerPointsMarketTable({ props, match }: { props: unknown[]; match: MatchDetailResponse }) {
  const rows = props.map(asObject).filter((row) => String(row.market || "").toUpperCase() === "POINTS");
  return (
    <section className="sectionCard">
      <div className="sectionHeading">
        <div><p className="eyebrow">PLAYER MARKETS</p><h3>Player Points</h3></div>
        <StatusPill label={`${rows.length} ROWS`} tone="neutral" />
      </div>
      <div className="tableScroller lineTableWrap">
        <table className="comparisonTable compactTable marketLineTable profileMarketTable">
          <thead><tr><th>Player</th><th>Team</th><th>Line</th><th>Pick</th><th>Result</th><th>Profile L5/L10/H2H</th><th>Hit L5/L10/H2H</th><th>Edge L5/L10/H2H</th><th>Status</th><th>Source</th></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${String(row.player)}-${index}`}>
                <td><strong>{String(row.player || "-")}</strong><small>POINTS</small></td>
                <td>{String(row.team || "-")}</td>
                <td><strong>{formatNum(asNumber(row.line), 1)}</strong><small>O {formatNum(asNumber(row.odds_over), 2)} · U {formatNum(asNumber(row.odds_under), 2)}</small></td>
                <td>{pickBadge(row.pick)}</td>
                <td>{resultBadge(marketResult(row, match))}</td>
                <td>L5 {formatNum(asNumber(row.projection), 1)} / L10 - / H2H -</td>
                <td>-</td>
                <td>L5 {formatNum(asNumber(row.edge), 1)} / L10 - / H2H -</td>
                <td><span className={`statusChip ${statusClass(row.confidence)}`}>{String(row.confidence || "LINE_ONLY")}</span></td>
                <td>{String(row.projection_source || "-")}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={10}>Player points markets unavailable.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProjectionMatrixSection({ analytics }: { analytics: MatchAnalyticsResponse }) {
  const rows = (analytics.projection_matrix?.rows || []).map(asObject).filter((row) => !isMainMarketMatrixRow(row));
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
            <tr><th>Market</th><th>Side</th><th>Line</th><th>Pick</th><th>M2</th><th>M4</th><th>Consensus</th><th>Model</th><th>Profile L5/L10</th><th>Home/Away L5 · H2H</th><th>Hit L5/L10/H2H</th><th>Edge</th><th>Status</th><th>Risk</th></tr>
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
                  <td>{formatNum(asNumber(models.m2), 1)}</td>
                  <td>{formatNum(asNumber(models.m4), 1)}</td>
                  <td>{formatNum(asNumber(models.consensus), 1)}</td>
                  <td>{formatProjectionList(models, ["shot_model", "calculation"])}</td>
                  <td>{formatProjectionList(profiles, ["last5", "last10"])}</td>
                  <td>{formatProjectionList(profiles, ["venue", "h2h"])}</td>
                  <td>{formatHitRates(hit)}</td>
                  <td>{formatNum(asNumber(row.edge), 1)}</td>
                  <td>{String(row.recommendation_status || "-")}</td>
                  <td>{row.source_conflict ? "MODEL/PROFILE" : String(row.sample_quality || "-").toUpperCase()}</td>
                </tr>
              );
            })}
            {!rows.length ? <tr><td colSpan={14}>No matrix rows.</td></tr> : null}
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
            <span>{key.toUpperCase()}</span>
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
            <div className="periodMarketGrid">
              <PeriodMarketLine label="Winner" block={asObject(period.block.winner)} winner />
              <PeriodMarketLine label="Spread" block={asObject(period.block.spread)} />
              <PeriodMarketLine label="Total" block={asObject(period.block.total)} />
              <PeriodMarketLine label="IT Home" block={asObject(asObject(period.block.team_totals).home)} />
              <PeriodMarketLine label="IT Away" block={asObject(asObject(period.block.team_totals).away)} />
            </div>
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

function PlayersSection({ analytics, prematch, showProps = true }: { analytics: MatchAnalyticsResponse; prematch: PrematchResponse; showProps?: boolean }) {
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
      {showProps ? <div className="tableScroller">
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
      </div> : null}
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

function StaticSignalsSection({ signals }: { signals: SignalResponse }) {
  return (
    <section className="panel" id="signals">
      <div className="panelHeader">
        <h2>Live Signals</h2>
        <StatusPill label={`${signals.count || 0} LIVE SIGNALS`} tone="green" />
      </div>
      {signals.available === false ? <div className="stateBox danger">Signals temporarily unavailable.</div> : null}
      {signals.available !== false && !signals.items.length ? <div className="emptyCard">No live signals for this match</div> : null}
      <div className="signalGrid">
        {signals.items.map((signal) => (
          <div className="signalCard" key={`${signal.signal_no || signal.market}-${signal.created_at || signal.line}`}>
            <span>{signal.market}</span>
            <strong>{signal.selection}</strong>
            <small>line {formatNum(signal.line, 1)} · odds {formatNum(signal.odds, 2)} · edge {formatNum(signal.edge, 1)}</small>
            <small>{signal.status || "WATCH"} · {signal.result_status || "open"} · {formatNum(signal.profit_1u, 2)}u</small>
            <small>{signal.created_at || "-"}</small>
          </div>
        ))}
      </div>
    </section>
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

function isMainMarketMatrixRow(row: ApiObject): boolean {
  const key = String(row.key || "");
  const market = String(row.market || "");
  return key.startsWith("main_") || ["total", "home_team_total", "away_team_total", "spread"].includes(market);
}

function enrichMainMarketRow(row: ApiObject, analytics: MatchAnalyticsResponse): ApiObject {
  const profiles = asObject(row.profile_projections);
  if (Object.keys(profiles).length) return row;
  const line = asNumber(row.line);
  const market = String(row.market || "");
  const side = String(row.side || "");
  const profileSource = mainProfileValues(market, side, analytics);
  const h2hGames = Array.isArray(analytics.h2h_games) ? analytics.h2h_games.map(asObject) : [];
  const homeProfile = asObject(asObject(analytics.team_profiles).home);
  const awayProfile = asObject(asObject(analytics.team_profiles).away);
  const homeRecentRaw = homeProfile.recent_games;
  const awayRecentRaw = awayProfile.recent_games;
  const homeRecent = Array.isArray(homeRecentRaw) ? homeRecentRaw.map(asObject) : [];
  const awayRecent = Array.isArray(awayRecentRaw) ? awayRecentRaw.map(asObject) : [];
  const hitRates = mainHitRates(market, side, row.pick, line, homeRecent, awayRecent, h2hGames);
  return { ...row, profile_projections: profileSource, hit_rates: hitRates };
}

function mainProfileValues(market: string, side: string, analytics: MatchAnalyticsResponse): ApiObject {
  const profiles = asObject(analytics.team_profiles);
  const homeWindows = asObject(asObject(profiles.home).windows);
  const awayWindows = asObject(asObject(profiles.away).windows);
  const h2hGames = Array.isArray(analytics.h2h_games) ? analytics.h2h_games.map(asObject) : [];
  const profileFor = (split: string, window: string) => asObject(asObject(split === "home" ? homeWindows.overall : awayWindows.overall)[window]);
  const totalFor = (window: string) => sumNullable(asNumber(profileFor("home", window).points), asNumber(profileFor("away", window).points));
  const homeFor = (window: string) => asNumber(profileFor("home", window).points);
  const awayFor = (window: string) => asNumber(profileFor("away", window).points);
  const spreadFor = (window: string) => {
    const home = homeFor(window);
    const away = awayFor(window);
    return home == null || away == null ? null : round1(home - away);
  };
  const h2hValue = h2hProjection(market, side, h2hGames);
  if (market === "total") return { last5: totalFor("last5"), last10: totalFor("last10"), h2h: h2hValue };
  if (market === "home_team_total") return { last5: homeFor("last5"), last10: homeFor("last10"), h2h: h2hValue };
  if (market === "away_team_total") return { last5: awayFor("last5"), last10: awayFor("last10"), h2h: h2hValue };
  if (market === "spread") return { last5: spreadFor("last5"), last10: spreadFor("last10"), h2h: h2hValue };
  return {};
}

function h2hProjection(market: string, side: string, games: ApiObject[]): number | null {
  if (!games.length) return null;
  const values = games.map((game) => {
    if (market === "total") return asNumber(game.total);
    if (market === "home_team_total") return asNumber(game.home_points ?? game.points);
    if (market === "away_team_total") return asNumber(game.away_points ?? game.opp_points);
    if (market === "spread") {
      const home = asNumber(game.home_points ?? game.points);
      const away = asNumber(game.away_points ?? game.opp_points);
      return home == null || away == null ? null : (side === "away" ? away - home : home - away);
    }
    return null;
  }).filter((value): value is number => value != null);
  return average(values);
}

function mainHitRates(market: string, side: string, pick: unknown, line: number | null, homeRecent: ApiObject[], awayRecent: ApiObject[], h2hGames: ApiObject[]): ApiObject {
  if (line == null) return {};
  const splitGames = side === "away" ? awayRecent : homeRecent;
  const metric = (game: ApiObject) => {
    if (market === "total") return asNumber(game.total);
    if (market === "home_team_total" || market === "away_team_total") return asNumber(game.points);
    if (market === "spread") return asNumber(game.margin);
    return null;
  };
  const h2hMetric = (game: ApiObject) => {
    if (market === "total") return asNumber(game.total);
    if (market === "home_team_total") return asNumber(game.home_points ?? game.points);
    if (market === "away_team_total") return asNumber(game.away_points ?? game.opp_points);
    if (market === "spread") {
      const home = asNumber(game.home_points ?? game.points);
      const away = asNumber(game.away_points ?? game.opp_points);
      return home == null || away == null ? null : (side === "away" ? away - home : home - away);
    }
    return null;
  };
  return {
    last5: hitRate(splitGames.slice(0, 5).map(metric), line, pick, market),
    last10: hitRate(splitGames.slice(0, 10).map(metric), line, pick, market),
    h2h: hitRate(h2hGames.map(h2hMetric), line, pick, market),
  };
}

function periodProfileValues(period: string, analytics: MatchAnalyticsResponse): ApiObject {
  const factor = period.toLowerCase().startsWith("q1") ? 0.25 : period.toLowerCase().startsWith("h1") ? 0.5 : 1;
  const scale = (value: number | null) => value == null ? null : round1(value * factor);
  const total = mainProfileValues("total", "total", analytics);
  const home = mainProfileValues("home_team_total", "home", analytics);
  const away = mainProfileValues("away_team_total", "away", analytics);
  const spread = mainProfileValues("spread", "home", analytics);
  const scaleProfile = (source: ApiObject) => ({
    last5: scale(asNumber(source.last5)),
    last10: scale(asNumber(source.last10)),
    h2h: scale(asNumber(source.h2h)),
  });
  return {
    total: scaleProfile(total),
    home: scaleProfile(home),
    away: scaleProfile(away),
    spread: scaleProfile(spread),
  };
}

function periodMarketRows(analytics: MatchAnalyticsResponse, prematch: PrematchResponse, frozen: FrozenPrematchResponse): ApiObject[] {
  const periodMarkets = asObject(analytics.markets?.periods);
  if (!Object.keys(periodMarkets).length) {
    return getQuarterProfiles(frozen, prematch).map((row) => ({
      key: `${row.label.toLowerCase()}_total`,
      market: `${row.label} Total`,
      side: "total",
      line: row.line,
      projection: row.projection,
      edge: row.edge,
      pick: row.edge == null ? null : row.edge > 0 ? "OVER" : "UNDER",
      status: "available",
      model_projections: { consensus: row.projection },
      profile_projections: {},
      hit_rates: {},
    }));
  }
  return Object.entries(periodMarkets).flatMap(([period, raw]) => {
    const block = asObject(raw);
    const winner = asObject(block.winner);
    const spread = asObject(block.spread);
    const total = asObject(block.total);
    const teamTotals = asObject(block.team_totals);
    const periodProfiles = periodProfileValues(period, analytics);
    return [
      {
        key: `${period}_winner`,
        market: `${period.toUpperCase()} Winner`,
        side: "home/away",
        line_label: `W1 ${formatNum(asNumber(winner.home_odds), 2)} / W2 ${formatNum(asNumber(winner.away_odds), 2)}`,
        status: winner.status || "missing",
      },
      {
        key: `${period}_spread`,
        market: `${period.toUpperCase()} Spread`,
        side: "home/away",
        line: asNumber(spread.home_line),
        away_line: asNumber(spread.away_line),
        odds_over: asNumber(spread.home_odds),
        odds_under: asNumber(spread.away_odds),
        projection: asNumber(spread.projection),
        edge: asNumber(spread.edge),
        pick: spread.pick,
        status: spread.status || "line_only",
        model_projections: { consensus: asNumber(spread.projection) },
        profile_projections: asObject(periodProfiles.spread),
        hit_rates: {},
      },
      {
        key: `${period}_total`,
        market: `${period.toUpperCase()} Total`,
        side: "total",
        ...total,
        model_projections: { consensus: asNumber(total.projection) },
        profile_projections: asObject(periodProfiles.total),
        hit_rates: {},
      },
      {
        key: `${period}_it_home`,
        market: `${period.toUpperCase()} Home Total`,
        side: "home",
        ...asObject(teamTotals.home),
        model_projections: { consensus: asNumber(asObject(teamTotals.home).projection) },
        profile_projections: asObject(periodProfiles.home),
        hit_rates: {},
      },
      {
        key: `${period}_it_away`,
        market: `${period.toUpperCase()} Away Total`,
        side: "away",
        ...asObject(teamTotals.away),
        model_projections: { consensus: asNumber(asObject(teamTotals.away).projection) },
        profile_projections: asObject(periodProfiles.away),
        hit_rates: {},
      },
    ].map(asObject);
  });
}

function lineText(row: ApiObject): string {
  if (row.line_label) return String(row.line_label);
  const line = asNumber(row.line);
  const awayLine = asNumber(row.away_line);
  if (awayLine != null && String(row.side).includes("home/away")) return `${formatSigned(line)} / ${formatSigned(awayLine)}`;
  return formatNum(line, 1);
}

function oddsText(row: ApiObject): string {
  const over = asNumber(row.odds_over);
  const under = asNumber(row.odds_under);
  const odds = asNumber(row.odds);
  if (over != null || under != null) return `O ${formatNum(over, 2)} · U ${formatNum(under, 2)}`;
  return odds == null ? "" : `odds ${formatNum(odds, 2)}`;
}

function pickBadge(value: unknown): ReactNode {
  const text = String(value || "-");
  const lower = text.toLowerCase();
  const cls = lower.includes("over") || lower.includes("home") ? "pick-over" : lower.includes("under") || lower.includes("away") ? "pick-under" : "";
  return <span className={`pickChip ${cls}`}>{text}</span>;
}

function projectionEdgeCell(value: number | null, line: number | null, row: ApiObject): ReactNode {
  if (value == null) return "-";
  const edge = projectionEdge(value, line, row);
  return <span className="projectionCell"><span>{formatNum(value, 1)}</span>{edgeBadge(edge)}</span>;
}

function projectionEdge(value: number | null, line: number | null, row: ApiObject): number | null {
  if (value == null || line == null) return null;
  if (String(row.market || "").toLowerCase().includes("spread")) {
    return String(row.side || "").toLowerCase().includes("away") ? round1(-value + line) : round1(value + line);
  }
  return round1(value - line);
}

function edgeBadge(edge: number | null): ReactNode {
  if (edge == null) return null;
  return <span className={`edgeBadge ${edgeClass(edge)}`}>{edge > 0 ? "+" : ""}{formatNum(edge, 1)}</span>;
}

function edgeClass(edge: number): string {
  if (edge >= 2.51) return "edgeStrongPos";
  if (edge >= 1.01) return "edgeMedPos";
  if (edge <= -2.51) return "edgeStrongNeg";
  if (edge <= -1.01) return "edgeMedNeg";
  return "edgeNeutral";
}

function edgeStack(profiles: ApiObject, consensus: number | null, line: number | null, row: ApiObject): string {
  const l5 = projectionEdge(asNumber(profiles.last5), line, row);
  const l10 = projectionEdge(asNumber(profiles.last10), line, row);
  const cons = projectionEdge(consensus, line, row);
  return `L5 ${formatNum(l5, 1)} / L10 ${formatNum(l10, 1)} / Cons ${formatNum(cons, 1)}`;
}

function profileEdgeStack(profiles: ApiObject, line: number | null, row: ApiObject): string {
  const l5 = projectionEdge(asNumber(profiles.last5), line, row);
  const l10 = projectionEdge(asNumber(profiles.last10), line, row);
  const h2h = projectionEdge(asNumber(profiles.h2h), line, row);
  return `L5 ${formatNum(l5, 1)} / L10 ${formatNum(l10, 1)} / H2H ${formatNum(h2h, 1)}`;
}

function resultBadge(result: string): ReactNode {
  if (result === "-") return "-";
  return <span className={`statusChip ${result === "WIN" ? "statusPlay" : result === "LOSS" ? "statusMissing" : "statusNeutral"}`}>{result}</span>;
}

function marketResult(row: ApiObject, match: MatchDetailResponse): string {
  if (!isAfterTipoffStatus(match.status)) return "-";
  const pick = String(row.pick || "").toUpperCase();
  const market = String(row.market || "").toLowerCase();
  const key = String(row.key || "").toLowerCase();
  const line = asNumber(row.line);
  const actual = marketActualValue(row, match);
  if (actual == null || line == null || !pick || pick === "-") return "-";
  if (market.includes("spread") || key.includes("spread")) {
    const edge = actual + line;
    const covered = edge > 0 ? "HOME_COVER" : edge < 0 ? "AWAY_COVER" : "PUSH";
    return covered === "PUSH" ? "PUSH" : pick.includes(covered) ? "WIN" : "LOSS";
  }
  if (actual === line) return "PUSH";
  if (pick.includes("OVER")) return actual > line ? "WIN" : "LOSS";
  if (pick.includes("UNDER")) return actual < line ? "WIN" : "LOSS";
  return "-";
}

function marketActualValue(row: ApiObject, match: MatchDetailResponse): number | null {
  const key = String(row.key || "").toLowerCase();
  const market = String(row.market || "").toLowerCase();
  const score = match.score || { home: match.home_score, away: match.away_score };
  const home = asNumber(score.home);
  const away = asNumber(score.away);
  if (home == null || away == null) return null;
  const period = key.startsWith("h1_") || market.startsWith("h1") ? periodScore(match, 2) : key.startsWith("q1_") || market.startsWith("q1") ? periodScore(match, 1) : null;
  const actualHome = period?.home ?? home;
  const actualAway = period?.away ?? away;
  if (market.includes("winner")) return null;
  if (market.includes("total") && !market.includes("team") && !market.includes("home") && !market.includes("away")) return actualHome + actualAway;
  if (market.includes("home total") || market.includes("home_team_total") || key.includes("it_home")) return actualHome;
  if (market.includes("away total") || market.includes("away_team_total") || key.includes("it_away")) return actualAway;
  if (market.includes("spread") || key.includes("spread")) return actualHome - actualAway;
  return asNumber(row.actual_value);
}

function periodScore(match: MatchDetailResponse, periods: number): { home: number; away: number } | null {
  const rows = Array.isArray(match.quarter_scores) ? match.quarter_scores.slice(0, periods) : [];
  if (!rows.length) return null;
  const home = rows.reduce((sum, row) => sum + (asNumber(row.home) ?? 0), 0);
  const away = rows.reduce((sum, row) => sum + (asNumber(row.away) ?? 0), 0);
  return { home, away };
}

function statusClass(value: unknown): string {
  const text = String(value || "").toLowerCase();
  if (text.includes("play")) return "statusPlay";
  if (text.includes("lean")) return "statusLean";
  if (text.includes("watch")) return "statusWatch";
  if (text.includes("missing") || text.includes("blocked")) return "statusMissing";
  return "statusNeutral";
}

function riskCell(row: ApiObject): ReactNode {
  if (row.source_conflict) return <span className="riskChip">MODEL/PROFILE</span>;
  const risks = Array.isArray(row.risk_codes) ? row.risk_codes.map(String) : [];
  if (risks.length) return risks.slice(0, 3).map((risk) => <span className="riskChip" key={risk}>{risk}</span>);
  return String(row.sample_quality || "-").toUpperCase();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sumNullable(a: number | null, b: number | null): number | null {
  return a == null || b == null ? null : round1(a + b);
}

function average(values: number[]): number | null {
  return values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function hitRate(values: Array<number | null>, line: number, pick: unknown, market: string): ApiObject | null {
  const usable = values.filter((value): value is number => value != null);
  if (!usable.length) return null;
  const pickText = String(pick || "").toUpperCase();
  const wins = usable.filter((value) => {
    if (market === "spread") {
      const cover = value + line;
      if (pickText.includes("HOME_COVER")) return cover > 0;
      if (pickText.includes("AWAY_COVER")) return cover < 0;
      return false;
    }
    if (pickText.includes("OVER")) return value > line;
    if (pickText.includes("UNDER")) return value < line;
    return false;
  }).length;
  return { sample: usable.length, pick_hit_rate: wins / usable.length, average: average(usable) };
}

function formatProjectionList(source: ApiObject, keys: string[]): string {
  const parts = keys
    .map((key) => {
      const value = asNumber(source[key]);
      return value == null ? null : `${projectionLabel(key)} ${formatNum(value, 1)}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "-";
}

function projectionLabel(key: string): string {
  return ({ last5: "L5", last10: "L10", venue: "H/A L5", h2h: "H2H", shot_model: "Shot model", calculation: "Calc", consensus: "Consensus", m2: "M2", m4: "M4" } as Record<string, string>)[key] || key.toUpperCase();
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

function formatQuarterScores(scores: MatchDetailResponse["quarter_scores"]): string {
  const rows = Array.isArray(scores) ? scores : [];
  return rows
    .filter((row) => row.home != null || row.away != null)
    .map((row) => `${row.home ?? "-"}-${row.away ?? "-"}`)
    .join(" · ");
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

import type { ReactNode } from "react";

import { ApiUnavailable } from "@/components/ApiUnavailable";
import { LiveMatchCenter, LiveResultComparison, MatchHeroScore } from "@/components/match/LiveMatchCenter";
import { RecommendationTable } from "@/components/RecommendationTable";
import { StatusPill } from "@/components/StatusPill";
import {
  formatNum,
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
  MatchDetailResponse,
  PostgameResponse,
  PrematchResponse,
  SignalResponse,
} from "@/lib/matchTypes";
import { formatMatchDate, formatMatchTime } from "@/lib/time";

type OptionalResult<T> = { data: T; error: string | null };

const tabs = [
  ["prematch", "Prematch"],
  ["live-center", "Live Center"],
  ["markets", "Markets"],
  ["team-form", "Team Form"],
  ["quarter-profiles", "Quarter Profiles"],
  ["shot-markets", "Shot Markets"],
  ["signals", "Signals"],
  ["recommendations", "Recommendations"],
  ["result", "Result"],
] as const;

const emptyPrematch: PrematchResponse = { available: false, data_quality: { reason: "prematch_unavailable" } };
const emptyPostgame: PostgameResponse = { available: false };
const emptyRecommendations: RecommendationsResponse = { count: 0, limit: 0, offset: 0, cohorts: [], items: [] };
const emptyFrozen: FrozenPrematchResponse = { available: false, source: "fallback_ledger", partial: true, items: [] };

export default async function MatchPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  let match: MatchDetailResponse;

  try {
    match = await serverApiGet<MatchDetailResponse>(`/api/v1/public/basket/matches/${gameId}`);
  } catch {
    return <ApiUnavailable title="Match API unavailable" />;
  }

  const [prematchResult, postgameResult, recsResult, frozenResult] = await Promise.all([
    optionalApiGet(`/api/v1/public/basket/matches/${gameId}/prematch`, emptyPrematch),
    optionalApiGet(`/api/v1/public/basket/matches/${gameId}/postgame`, emptyPostgame),
    optionalApiGet(`/api/v1/public/basket/matches/${gameId}/recommendations`, emptyRecommendations),
    optionalApiGet(`/api/v1/public/basket/matches/${gameId}/frozen-prematch`, emptyFrozen),
  ]);

  const prematch = prematchResult.data;
  const postgame = postgameResult.data;
  const recs = recsResult.data;
  const frozen = frozenResult.data;
  const liveSeed = initialLive(match);
  const frozenItems = frozenRecommendations(frozen);
  const modelSource = frozen.models || prematch.models || (asObject(match.model_summary) as FrozenPrematchResponse["models"]) || {};
  const marketSource = frozen.markets || prematch.market || match.market || {};
  const endpointErrors = [
    ["Prematch", prematchResult.error],
    ["Postgame", postgameResult.error],
    ["Recommendations", recsResult.error],
    ["Frozen prematch", frozenResult.error],
  ].filter(([, error]) => error);

  return (
    <section className="matchPage">
      <MatchHero match={match} initialLive={liveSeed} />
      <nav className="tabsRow stickyTabs" aria-label="Match sections">
        {tabs.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
      </nav>

      <section className="matchLayout">
        <div className="matchMain">
          {endpointErrors.map(([label, error]) => <EndpointNotice key={label} label={label || "Endpoint"} error={error || ""} />)}
          <PrematchSection prematch={prematch} frozen={frozen} frozenItems={frozenItems} models={modelSource} />
          <LiveMatchCenter
            gameId={gameId}
            initialLive={liveSeed}
            initialSignals={{ game_id: gameId, count: 0, items: [] }}
            initialStatus={match.status}
          />
          <MarketsSection markets={marketSource} models={modelSource} />
          <TeamFormSection prematch={prematch} frozen={frozen} match={match} />
          <QuarterProfilesSection prematch={prematch} frozen={frozen} />
          <ShotMarketsSection prematch={prematch} frozen={frozen} />
          <section className="panel" id="recommendations">
            <div className="panelHeader">
              <h2>Recommendations</h2>
              <StatusPill label={`${recs.count} PUBLIC`} tone="neutral" />
            </div>
            <RecommendationTable items={recs.items} />
          </section>
          <LiveResultComparison
            gameId={gameId}
            initialLive={liveSeed}
            initialStatus={match.status}
            initialPostgame={postgame}
            match={match}
            frozenItems={frozenItems}
            ledgerItems={recs.items}
          />
        </div>

        <aside className="matchRail">
          <RailCard title="Data Quality" rows={qualityRows(match.data_quality, prematch.data_quality, frozen.data_quality)} />
          <RailCard title="Model State" rows={[
            ["Source", frozen.calculation_source || prematch.calculation_source || match.calculation_source || "-"],
            ["Roster", frozen.roster_state || prematch.roster_state || match.roster_state || "-"],
            ["Revision", frozen.revision || frozen.calculation_revision || prematch.calculation_revision || match.calculation_revision || "-"],
          ]} />
          <RailCard title="Signal Summary" rows={[
            ["Wins", postgame.signals_summary?.wins ?? 0],
            ["Losses", postgame.signals_summary?.losses ?? 0],
            ["Profit", `${formatNum(postgame.signals_summary?.profit_1u, 2)}u`],
          ]} />
        </aside>
      </section>
    </section>
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

function MatchHero({ match, initialLive }: { match: MatchDetailResponse; initialLive: LiveResponse }) {
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
        <MatchHeroScore gameId={match.game_id} match={match} initialLive={initialLive} />
      </div>
    </header>
  );
}

function PrematchSection({
  prematch,
  frozen,
  frozenItems,
  models,
}: {
  prematch: PrematchResponse;
  frozen: FrozenPrematchResponse;
  frozenItems: RecommendationsResponse["items"];
  models: FrozenPrematchResponse["models"];
}) {
  return (
    <section className="panel" id="prematch">
      <div className="panelHeader">
        <h2>Prematch</h2>
        <StatusPill label={frozenBadgeLabel(frozen)} tone={frozen.partial ? "purple" : "green"} />
      </div>
      <div className="metricGrid compactMetrics">
        <Metric label="Snapshot" value={frozen.snapshot_at || "-"} />
        <Metric label="Revision" value={frozen.revision || prematch.calculation_revision || "-"} />
        <Metric label="Source" value={(frozen.calculation_source || prematch.calculation_source || "-").toUpperCase()} />
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

function MarketsSection({ markets, models }: { markets: ApiObject | null | undefined; models: FrozenPrematchResponse["models"] }) {
  const rows = normalizePrematchMarkets(markets, models);
  return (
    <section className="panel" id="markets">
      <div className="panelHeader"><h2>Markets</h2><StatusPill label="BOOK VS MODEL" tone="neutral" /></div>
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

function TeamFormSection({ prematch, frozen, match }: { prematch: PrematchResponse; frozen: FrozenPrematchResponse; match: MatchDetailResponse }) {
  const analytics = asObject(frozen.analytics);
  const profiles = asObject(analytics.team_profiles || analytics.form_profiles || analytics.teams);
  const players = prematch.players || {};
  const reason = !Object.keys(profiles).length ? "Full team form unavailable in snapshot; showing roster fallback when available." : null;
  return (
    <section className="panel" id="team-form">
      <div className="panelHeader"><h2>Team Form</h2><StatusPill label="ROSTER / PROFILE" tone="neutral" /></div>
      {reason ? <div className="emptyCard">{reason}</div> : null}
      <div className="teamGrid">
        <TeamCard side="Home" name={match.home_team || "Home"} profile={asObject(profiles.home)} players={players.home || []} />
        <TeamCard side="Away" name={match.away_team || "Away"} profile={asObject(profiles.away)} players={players.away || []} />
      </div>
    </section>
  );
}

function TeamCard({ side, name, profile, players }: { side: string; name: string; profile: ApiObject; players: NonNullable<PrematchResponse["players"]>["home"] }) {
  const last5 = asObject(profile.last5 || profile.last_5);
  const last10 = asObject(profile.last10 || profile.last_10);
  const season = asObject(profile.season);
  const split = asObject(profile.home_away_split || profile.split);
  const starters = players?.filter((player) => !player.injured).slice(0, 5) || [];
  const injured = players?.filter((player) => player.injured) || [];
  return (
    <div className="teamCard">
      <div className="panelHeader"><h3>{name}</h3><span className="league">{side}</span></div>
      <div className="miniMetrics">
        <Metric label="Last 5 PF/PA" value={`${formatNum(asNumber(last5.points_for ?? last5.pf), 1)} / ${formatNum(asNumber(last5.points_allowed ?? last5.pa), 1)}`} />
        <Metric label="Last 10 PF/PA" value={`${formatNum(asNumber(last10.points_for ?? last10.pf), 1)} / ${formatNum(asNumber(last10.points_allowed ?? last10.pa), 1)}`} />
        <Metric label="Average total" value={formatNum(asNumber(last10.total ?? last10.average_total ?? season.average_total), 1)} />
        <Metric label="Home/Away split" value={formatNum(asNumber(split.average_total ?? split.total), 1)} />
        <Metric label="Season average" value={formatNum(asNumber(season.average_total ?? season.total), 1)} />
        <Metric label="Roster state" value={injured.length ? `${injured.length} out` : "available"} />
      </div>
      <div className="playerList">
        {starters.map((player) => <span key={player.player_id || player.name || "starter"}>{player.name}</span>)}
        {!starters.length ? <span>No starters feed</span> : null}
      </div>
      {injured.length ? <div className="playerList">{injured.map((player) => <span key={player.player_id || player.name || "injured"}>{player.name} out</span>)}</div> : null}
    </div>
  );
}

function QuarterProfilesSection({ prematch, frozen }: { prematch: PrematchResponse; frozen: FrozenPrematchResponse }) {
  const rows = getQuarterProfiles(frozen, prematch);
  return (
    <section className="panel" id="quarter-profiles">
      <div className="panelHeader"><h2>Quarter Profiles</h2><StatusPill label="PERIOD SHAPE" tone="purple" /></div>
      {!rows.length ? <div className="emptyCard">Quarter profile unavailable</div> : null}
      <div className="quarterGrid">
        {rows.map((row) => (
          <div className="metricCard" key={row.label}>
            <span>{row.label}</span>
            <strong>{formatNum(row.projection, 1)}</strong>
            <small>line {formatNum(row.line, 1)} · edge {formatNum(row.edge, 1)}</small>
            <small>home {formatNum(row.homeAverage, 1)} · away {formatNum(row.awayAverage, 1)}</small>
            <small>combined {formatNum(row.combinedAverage, 1)} · sample {formatNum(row.sampleSize, 0)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShotMarketsSection({ prematch, frozen }: { prematch: PrematchResponse; frozen: FrozenPrematchResponse }) {
  const rows = shotMarketRows(frozen.shot_markets || prematch.shot_markets);
  return (
    <section className="panel" id="shot-markets">
      <div className="panelHeader"><h2>Shot Markets</h2><StatusPill label="2PM / 3PM" tone="purple" /></div>
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
  return sources.flatMap((source) => Object.entries(asObject(source)).map(([key, value]) => [key, String(value)] as [string, string])).slice(0, 9);
}

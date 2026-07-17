import type { ReactNode } from "react";

import { ApiUnavailable } from "@/components/ApiUnavailable";
import { RecommendationTable } from "@/components/RecommendationTable";
import { StatusPill } from "@/components/StatusPill";
import {
  formatNum,
  frozenBadgeLabel,
  frozenRecommendations,
  FrozenPrematchResponse,
  RecommendationsResponse,
  serverApiGet,
} from "@/lib/api";
import { formatMatchDate, formatMatchTime } from "@/lib/time";

type JsonRecord = Record<string, any>;

type MatchDetail = {
  game_id: string;
  league?: string;
  game_date?: string;
  home_team?: string;
  away_team?: string;
  status?: string;
  home_score?: number | null;
  away_score?: number | null;
  score?: { home?: number | null; away?: number | null };
  flags?: { has_live?: boolean; has_postgame?: boolean; has_signals?: boolean };
  market?: JsonRecord;
  model_summary?: JsonRecord;
  calculation_source?: string | null;
  calculation_revision?: string | null;
  roster_state?: string | null;
  data_quality?: JsonRecord;
};

type PrematchReport = {
  available?: boolean;
  public_status?: string;
  calculation_source?: string | null;
  calculation_revision?: string | null;
  roster_state?: string | null;
  market?: JsonRecord;
  models?: JsonRecord;
  players?: { home?: JsonRecord[]; away?: JsonRecord[] };
  shot_markets?: JsonRecord;
  shot_quarters?: JsonRecord;
  risks?: unknown[];
  live_plan?: string[];
  data_quality?: JsonRecord;
};

type LivePayload = {
  available?: boolean;
  status?: string;
  score?: { home?: number | null; away?: number | null };
  clock?: { period?: string | null; timer?: string | null };
  live_market?: JsonRecord;
  live_projection?: JsonRecord;
  live_shot_markets?: JsonRecord;
  data_quality?: JsonRecord;
  updated_at?: string | null;
};

type SignalsPayload = {
  count: number;
  items: Array<{
    signal_no?: string;
    market?: string;
    selection?: string;
    line?: number | null;
    odds?: number | null;
    status?: string;
    result_status?: string | null;
    profit_1u?: number | null;
  }>;
  summary?: { wins?: number; losses?: number; pushes?: number; profit_1u?: number };
};

type PostgamePayload = {
  available?: boolean;
  final_score?: { home?: number; away?: number; total?: number; margin?: number };
  best_bet_result?: JsonRecord;
  market_results?: JsonRecord;
  signals_summary?: { wins?: number; losses?: number; pushes?: number; profit_1u?: number };
};

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

export default async function MatchPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  let match: MatchDetail;
  let prematch: PrematchReport;
  let live: LivePayload;
  let postgame: PostgamePayload;
  let signals: SignalsPayload;
  let recs: RecommendationsResponse;
  let frozen: FrozenPrematchResponse;

  try {
    [match, prematch, live, postgame, signals, recs, frozen] = await Promise.all([
      serverApiGet<MatchDetail>(`/api/v1/public/basket/matches/${gameId}`),
      serverApiGet<PrematchReport>(`/api/v1/public/basket/matches/${gameId}/prematch`),
      serverApiGet<LivePayload>(`/api/v1/public/basket/matches/${gameId}/live`),
      serverApiGet<PostgamePayload>(`/api/v1/public/basket/matches/${gameId}/postgame`),
      serverApiGet<SignalsPayload>(`/api/v1/public/basket/matches/${gameId}/signals`),
      serverApiGet<RecommendationsResponse>(`/api/v1/public/basket/matches/${gameId}/recommendations`),
      serverApiGet<FrozenPrematchResponse>(`/api/v1/public/basket/matches/${gameId}/frozen-prematch`),
    ]);
  } catch {
    return <ApiUnavailable title="Match API unavailable" />;
  }

  const score = match.score || { home: match.home_score, away: match.away_score };
  const frozenItems = frozenRecommendations(frozen);
  const models = prematch.models || match.model_summary || {};
  const market = prematch.market || match.market || frozen.markets || {};

  return (
    <section className="matchPage">
      <MatchHero match={match} score={score} />
      <nav className="tabsRow stickyTabs" aria-label="Match sections">
        {tabs.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
      </nav>

      <section className="matchLayout">
        <div className="matchMain">
          <PrematchSection prematch={prematch} frozen={frozen} frozenItems={frozenItems} models={models} />
          <LiveCenterSection live={live} match={match} />
          <MarketsSection market={market} models={models} />
          <TeamFormSection prematch={prematch} frozen={frozen} match={match} />
          <QuarterProfilesSection prematch={prematch} />
          <ShotMarketsSection prematch={prematch} live={live} />
          <SignalsSection signals={signals} />
          <section className="panel" id="recommendations">
            <div className="panelHeader">
              <h2>Recommendations</h2>
              <StatusPill label={`${recs.count} PUBLIC`} tone="neutral" />
            </div>
            <RecommendationTable items={recs.items} />
          </section>
          <ResultSection postgame={postgame} match={match} signals={signals} />
        </div>

        <aside className="matchRail">
          <RailCard title="Data Quality" rows={qualityRows(match.data_quality, prematch.data_quality, live.data_quality)} />
          <RailCard title="Model State" rows={[
            ["Source", prematch.calculation_source || match.calculation_source || "-"],
            ["Roster", prematch.roster_state || match.roster_state || "-"],
            ["Revision", prematch.calculation_revision || match.calculation_revision || "-"],
          ]} />
          <RailCard title="Signal Summary" rows={[
            ["Wins", signals.summary?.wins ?? 0],
            ["Losses", signals.summary?.losses ?? 0],
            ["Profit", formatNum(signals.summary?.profit_1u, 2)],
          ]} />
        </aside>
      </section>
    </section>
  );
}

function MatchHero({ match, score }: { match: MatchDetail; score: { home?: number | null; away?: number | null } }) {
  const status = match.flags?.has_live ? "LIVE" : (match.status || "scheduled").toUpperCase();
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
        <div><span>{match.home_team || "Home"}</span><strong>{score.home ?? "-"}</strong></div>
        <div className="scoreDivider">:</div>
        <div><span>{match.away_team || "Away"}</span><strong>{score.away ?? "-"}</strong></div>
        <StatusPill label={status} tone={match.flags?.has_live ? "red" : "neutral"} />
      </div>
    </header>
  );
}

function PrematchSection({ prematch, frozen, frozenItems, models }: { prematch: PrematchReport; frozen: FrozenPrematchResponse; frozenItems: RecommendationsResponse["items"]; models: JsonRecord }) {
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
        <Metric label="Roster" value={prematch.roster_state || "-"} />
      </div>
      <ModelBoard models={models} />
      <RecommendationTable items={frozenItems} />
    </section>
  );
}

function ModelBoard({ models }: { models: JsonRecord }) {
  const rows = [
    ["M2", models.m2],
    ["M4", models.m4],
    ["Consensus", models.consensus || models.nbl1_core],
  ].filter(([, value]) => value);
  if (!rows.length) return <div className="emptyCard">Model board is unavailable.</div>;
  return (
    <div className="modelGrid">
      {rows.map(([label, raw]) => {
        const item = raw as JsonRecord;
        return (
          <div className="metricCard modelCard" key={String(label)}>
            <span>{label}</span>
            <strong>{formatNum(numberValue(item.total ?? item.total_projection), 1)}</strong>
            <small>{formatNum(numberValue(item.home ?? item.home_projection), 1)} : {formatNum(numberValue(item.away ?? item.away_projection), 1)}</small>
          </div>
        );
      })}
    </div>
  );
}

function LiveCenterSection({ live, match }: { live: LivePayload; match: MatchDetail }) {
  return (
    <section className="panel" id="live-center">
      <div className="panelHeader">
        <h2>Live Center</h2>
        <StatusPill label={live.available ? "LIVE DATA" : "NOT LIVE"} tone={live.available ? "red" : "neutral"} />
      </div>
      <div className="liveCenterGrid">
        <div className="liveScoreTile">
          <span>{live.clock?.period || match.status || "-"}</span>
          <strong>{live.score?.home ?? "-"} : {live.score?.away ?? "-"}</strong>
          <small>{live.clock?.timer || live.updated_at || "Clock unavailable"}</small>
        </div>
        <Metric label="Projected total" value={formatNum(numberValue(live.live_projection?.total), 1)} />
        <Metric label="Home live total" value={formatNum(numberValue(live.live_projection?.home_total), 1)} />
        <Metric label="Away live total" value={formatNum(numberValue(live.live_projection?.away_total), 1)} />
      </div>
      <div className="marketStrip">
        {marketRows(live.live_market || {}).map((row) => <MarketMini key={row.label} {...row} />)}
      </div>
    </section>
  );
}

function MarketsSection({ market, models }: { market: JsonRecord; models: JsonRecord }) {
  const consensus = models.consensus || models.nbl1_core || {};
  return (
    <section className="panel" id="markets">
      <div className="panelHeader"><h2>Markets</h2><StatusPill label="BOOK VS MODEL" tone="neutral" /></div>
      <div className="marketGrid">
        {marketRows(market).map((row) => <MarketMini key={row.label} {...row} />)}
        <MarketMini label="Model total" line={numberValue(consensus.total ?? consensus.total_projection)} note="projection" />
        <MarketMini label="Model spread" line={numberValue(consensus.spread ?? consensus.spread_projection)} note="home minus away" />
      </div>
    </section>
  );
}

function TeamFormSection({ prematch, frozen, match }: { prematch: PrematchReport; frozen: FrozenPrematchResponse; match: MatchDetail }) {
  const profiles = (frozen.analytics as JsonRecord | undefined)?.team_profiles || {};
  const players = prematch.players || {};
  return (
    <section className="panel" id="team-form">
      <div className="panelHeader"><h2>Team Form</h2><StatusPill label="ROSTER / PROFILE" tone="neutral" /></div>
      <div className="teamGrid">
        <TeamCard side="Home" name={match.home_team || "Home"} profile={profiles.home} players={players.home || []} />
        <TeamCard side="Away" name={match.away_team || "Away"} profile={profiles.away} players={players.away || []} />
      </div>
    </section>
  );
}

function TeamCard({ side, name, profile, players }: { side: string; name: string; profile?: JsonRecord; players: JsonRecord[] }) {
  const overall = profile?.overall || {};
  return (
    <div className="teamCard">
      <div className="panelHeader"><h3>{name}</h3><span className="league">{side}</span></div>
      <div className="miniMetrics">
        <Metric label="Last 10 PF" value={formatNum(numberValue(overall.last10?.points_for), 1)} />
        <Metric label="Last 10 PA" value={formatNum(numberValue(overall.last10?.points_allowed), 1)} />
        <Metric label="Season total" value={formatNum(numberValue(overall.season?.total), 1)} />
      </div>
      <div className="playerList">
        {players.slice(0, 6).map((player) => <span key={String(player.player_id || player.name)}>{player.name}</span>)}
        {!players.length ? <span>No roster feed</span> : null}
      </div>
    </div>
  );
}

function QuarterProfilesSection({ prematch }: { prematch: PrematchReport }) {
  const quarters = (prematch.shot_quarters as JsonRecord | undefined)?.data || {};
  const rows = ["home", "away"].map((side) => ({ side, fg2m: quarters[side]?.fg2m, fg3m: quarters[side]?.fg3m }));
  return (
    <section className="panel" id="quarter-profiles">
      <div className="panelHeader"><h2>Quarter Profiles</h2><StatusPill label="2PM / 3PM SHAPE" tone="purple" /></div>
      <div className="quarterGrid">
        {rows.map((row) => (
          <div className="metricCard" key={row.side}>
            <span>{row.side.toUpperCase()}</span>
            <strong>2PM {formatNum(numberValue(row.fg2m?.projection), 1)}</strong>
            <small>3PM {formatNum(numberValue(row.fg3m?.projection), 1)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShotMarketsSection({ prematch, live }: { prematch: PrematchReport; live: LivePayload }) {
  const rows = shotRows(prematch.shot_markets || {});
  return (
    <section className="panel" id="shot-markets">
      <div className="panelHeader"><h2>Shot Markets</h2><StatusPill label="2PM / 3PM" tone="purple" /></div>
      <div className="shotGrid">
        {rows.map((row) => <ShotCard key={row.label} {...row} />)}
      </div>
      <div className="emptyCard">Live 3PM: {live.live_shot_markets?.three_pm?.reason || "No live 3PM edge right now."}</div>
    </section>
  );
}

function SignalsSection({ signals }: { signals: SignalsPayload }) {
  return (
    <section className="panel" id="signals">
      <div className="panelHeader"><h2>Signals</h2><StatusPill label={`${signals.count} SIGNALS`} tone="green" /></div>
      <div className="signalGrid">
        {signals.items.map((signal) => (
          <div className="signalCard" key={signal.signal_no || signal.selection}>
            <span>{signal.market}</span>
            <strong>{signal.selection}</strong>
            <small>{signal.result_status || signal.status} · {formatNum(signal.profit_1u, 2)}u</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultSection({ postgame, match, signals }: { postgame: PostgamePayload; match: MatchDetail; signals: SignalsPayload }) {
  return (
    <section className="panel" id="result">
      <div className="panelHeader"><h2>Result comparison</h2><StatusPill label={postgame.available ? "FINAL" : "PENDING"} tone={postgame.available ? "green" : "neutral"} /></div>
      <div className="resultGrid">
        <Metric label="Final score" value={`${postgame.final_score?.home ?? match.home_score ?? "-"} : ${postgame.final_score?.away ?? match.away_score ?? "-"}`} />
        <Metric label="Final total" value={postgame.final_score?.total ?? "-"} />
        <Metric label="Best bet" value={String(postgame.best_bet_result?.result || "-")} />
        <Metric label="Signals P/L" value={`${formatNum(postgame.signals_summary?.profit_1u ?? signals.summary?.profit_1u, 2)}u`} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <div className="metricCard"><span>{label}</span><strong>{value}</strong></div>;
}

function MarketMini({ label, line, note }: { label: string; line?: number | null; note?: string }) {
  return <div className="marketMini"><span>{label}</span><strong>{formatNum(line, 1)}</strong><small>{note || "line"}</small></div>;
}

function ShotCard({ label, line, projection }: { label: string; line?: number | null; projection?: number | null }) {
  const edge = projection != null && line != null ? projection - line : null;
  return (
    <div className="shotCard">
      <span>{label}</span>
      <strong>{formatNum(projection, 1)}</strong>
      <small>line {formatNum(line, 1)} · edge {formatNum(edge, 1)}</small>
    </div>
  );
}

function RailCard({ title, rows }: { title: string; rows: Array<[string, ReactNode]> }) {
  return <div className="railCard"><h3>{title}</h3>{rows.map(([k, v]) => <div className="railRow" key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>;
}

function qualityRows(...sources: Array<JsonRecord | undefined>): Array<[string, ReactNode]> {
  return sources.flatMap((source) => Object.entries(source || {}).map(([key, value]) => [key, String(value)] as [string, string])).slice(0, 9);
}

function marketRows(market: JsonRecord): Array<{ label: string; line?: number | null; note?: string }> {
  return [
    { label: "Spread home", line: numberValue(market.spread?.home ?? market.spread?.line), note: "home handicap" },
    { label: "Spread away", line: numberValue(market.spread?.away), note: "away handicap" },
    { label: "Total", line: numberValue(market.total?.line), note: "game total" },
    { label: "Home IT", line: numberValue(market.team_totals?.home ?? market.it_home?.line), note: "team total" },
    { label: "Away IT", line: numberValue(market.team_totals?.away ?? market.it_away?.line), note: "team total" },
  ];
}

function shotRows(markets: JsonRecord): Array<{ label: string; line?: number | null; projection?: number | null }> {
  const sideLabel: Record<string, string> = { home: "Home", away: "Away", total: "Total" };
  return Object.entries(sideLabel).flatMap(([side, label]) => [
    { label: `${label} 2PM`, line: numberValue(markets[side]?.fg2m?.line), projection: numberValue(markets[side]?.fg2m?.projection) },
    { label: `${label} 3PM`, line: numberValue(markets[side]?.fg3m?.line), projection: numberValue(markets[side]?.fg3m?.projection) },
  ]);
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

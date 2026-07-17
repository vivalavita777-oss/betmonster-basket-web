"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { apiGet, formatNum, type RecommendationItem } from "@/lib/api";
import {
  asNumber,
  buildResultComparison,
  effectiveMatchStatus,
  heuristicBadges,
  isFinishedStatus,
  normalizeLiveMarkets,
  normalizeLiveThreePm,
  signalKey,
} from "@/lib/matchUtils";
import type { LiveResponse, MatchDetailResponse, PostgameResponse, SignalResponse } from "@/lib/matchTypes";
import { StatusPill } from "../StatusPill";

const fetcher = <T,>(path: string) => apiGet<T>(path);

export function LiveMatchCenter({
  gameId,
  initialLive,
  initialSignals,
  initialStatus,
}: {
  gameId: string;
  initialLive: LiveResponse;
  initialSignals: SignalResponse;
  initialStatus?: string | null;
}) {
  const initialPollingStatus = initialLive.status || initialStatus;
  const [livePollMs, setLivePollMs] = useState(pollInterval(initialPollingStatus));

  const liveState = useSWR<LiveResponse>(`/api/v1/public/basket/matches/${gameId}/live`, fetcher, {
    fallbackData: initialLive,
    refreshInterval: livePollMs,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    dedupingInterval: 0,
    revalidateOnFocus: true,
  });
  const live = liveState.data || initialLive;
  const status = effectiveMatchStatus(initialStatus, live.status);
  const interval = pollInterval(status);
  const signalsState = useSWR<SignalResponse>(`/api/v1/public/basket/matches/${gameId}/signals`, fetcher, {
    fallbackData: initialSignals,
    refreshInterval: livePollMs,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    dedupingInterval: 0,
    revalidateOnFocus: true,
  });

  const signals = signalsState.data || initialSignals;
  const now = Date.now();
  const updatedAt = live.updated_at ? new Date(live.updated_at).getTime() : null;
  const sourceAgeSeconds = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const stale = sourceAgeSeconds != null && sourceAgeSeconds > Math.max(90, interval / 500);

  useEffect(() => {
    setLivePollMs(pollInterval(status));
  }, [status]);

  return (
    <>
      <section className="panel" id="live-center">
        <div className="panelHeader">
          <h2>Live Center</h2>
          <div className="statusCluster">
            <StatusPill label={isFinishedStatus(status) ? "POLLING STOPPED" : `${interval / 1000}s POLL`} tone="neutral" />
            <StatusPill label={live.available ? "LIVE DATA" : "NO LIVE"} tone={live.available ? "red" : "neutral"} />
          </div>
        </div>
        {liveState.error ? <div className="stateBox danger">Live data temporarily unavailable. Retrying...</div> : null}
        <div className="telemetryRow">
          <span>Last updated: {live.updated_at || "-"}</span>
          <span>Source age: {sourceAgeSeconds == null ? "-" : `${sourceAgeSeconds}s`}</span>
          {stale ? <strong>Stale warning</strong> : null}
        </div>
        <div className="liveCenterGrid">
          <div className="liveScoreTile">
            <span>{live.clock?.period || live.status || initialStatus || "-"}</span>
            <strong>{live.score?.home ?? "-"} : {live.score?.away ?? "-"}</strong>
            <small>{live.clock?.timer || "Clock unavailable"}</small>
          </div>
          <Metric label="Projected total" value={formatNum(asNumber(live.live_projection?.total), 1)} />
          <Metric label="Home live total" value={formatNum(asNumber(live.live_projection?.home_total), 1)} />
          <Metric label="Away live total" value={formatNum(asNumber(live.live_projection?.away_total), 1)} />
        </div>
        <LiveMarketCards live={live} />
        <LiveThreePmCards live={live} sourceAgeSeconds={sourceAgeSeconds} />
      </section>

      <SignalsPanel signals={signals} error={Boolean(signalsState.error)} />
    </>
  );
}

function pollInterval(status?: string | null): number {
  if (isFinishedStatus(status)) return 0;
  if (["live", "inprogress", "in_progress", "playing", "q1", "q2", "q3", "q4", "halftime"].includes(String(status || "").toLowerCase())) return 10000;
  return 60000;
}

export function MatchHeroScore({
  gameId,
  match,
  initialLive,
}: {
  gameId: string;
  match: MatchDetailResponse;
  initialLive: LiveResponse;
}) {
  const initialScore = match.score || { home: match.home_score, away: match.away_score };
  const liveState = useSWR<LiveResponse>(`/api/v1/public/basket/matches/${gameId}/live`, fetcher, {
    fallbackData: initialLive,
    refreshInterval: pollInterval(effectiveMatchStatus(match.status, initialLive.status)),
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    revalidateOnFocus: true,
  });
  const live = liveState.data || initialLive;
  const status = effectiveMatchStatus(match.status, live.status);
  const dbScoreMissing = initialScore.home == null && initialScore.away == null;
  const useLiveScore = Boolean(live.available && live.score && (!isFinishedStatus(status) || dbScoreMissing));
  const score = useLiveScore ? live.score : initialScore;
  const label = isFinishedStatus(status) ? "FINISHED" : useLiveScore ? "LIVE" : (status || "scheduled").toUpperCase();

  return (
    <>
      <div><span>{match.home_team || "Home"}</span><strong>{score?.home ?? "-"}</strong></div>
      <div className="scoreDivider">:</div>
      <div><span>{match.away_team || "Away"}</span><strong>{score?.away ?? "-"}</strong></div>
      <StatusPill label={label} tone={useLiveScore ? "red" : "neutral"} />
    </>
  );
}

export function LiveResultComparison({
  gameId,
  initialLive,
  initialStatus,
  initialPostgame,
  match,
  frozenItems,
  ledgerItems,
}: {
  gameId: string;
  initialLive: LiveResponse;
  initialStatus?: string | null;
  initialPostgame: PostgameResponse;
  match: MatchDetailResponse;
  frozenItems: RecommendationItem[];
  ledgerItems: RecommendationItem[];
}) {
  const [postgame, setPostgame] = useState(initialPostgame);
  const [postgameRefreshed, setPostgameRefreshed] = useState(false);
  const liveState = useSWR<LiveResponse>(`/api/v1/public/basket/matches/${gameId}/live`, fetcher, {
    fallbackData: initialLive,
    refreshInterval: pollInterval(effectiveMatchStatus(initialStatus, initialLive.status)),
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    revalidateOnFocus: true,
  });
  const live = liveState.data || initialLive;
  const status = effectiveMatchStatus(initialStatus, live.status);

  useEffect(() => {
    if (!postgameRefreshed && isFinishedStatus(status)) {
      setPostgameRefreshed(true);
      apiGet<PostgameResponse>(`/api/v1/public/basket/matches/${gameId}/postgame`)
        .then(setPostgame)
        .catch(() => undefined);
    }
  }, [gameId, postgameRefreshed, status]);

  const rows = buildResultComparison(frozenItems, ledgerItems, postgame);
  const badges = heuristicBadges(postgame);
  return (
    <section className="panel" id="result">
      <div className="panelHeader">
        <h2>Result comparison</h2>
        <StatusPill label={postgame.available ? "FINAL" : "PENDING"} tone={postgame.available ? "green" : "neutral"} />
      </div>
      <div className="resultGrid">
        <Metric label="Final score" value={`${postgame.final_score?.home ?? match.home_score ?? "-"} : ${postgame.final_score?.away ?? match.away_score ?? "-"}`} />
        <Metric label="Final total" value={formatNum(postgame.final_score?.total, 0)} />
        <Metric label="Signals P/L" value={`${formatNum(postgame.signals_summary?.profit_1u, 2)}u`} />
        <Metric label="Rows" value={String(rows.length)} />
      </div>
      {postgame.best_bet_result ? (
        <div className="emptyCard">
          <div className="statusCluster">{badges.map((badge) => <StatusPill key={badge} label={badge} tone="purple" />)}</div>
          <strong>{postgame.best_bet_result.market || "-"} · {postgame.best_bet_result.selection || "-"}</strong>
          <small>{postgame.best_bet_result.result || "-"} · {formatNum(postgame.best_bet_result.profit_1u, 2)}u</small>
        </div>
      ) : null}
      <div className="tableScroller comparisonScroller">
        <table className="comparisonTable">
          <thead>
            <tr>
              <th>Market</th>
              <th>Pick</th>
              <th>Prematch line</th>
              <th>Odds</th>
              <th>Projection</th>
              <th>Edge</th>
              <th>Actual value</th>
              <th>Result status</th>
              <th>Profit 1u</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.market || "-"}</td>
                <td>{row.pick || "-"}</td>
                <td>{formatNum(row.line, 1)}</td>
                <td>{formatNum(row.odds, 2)}</td>
                <td>{formatNum(row.projection, 1)}</td>
                <td>{formatNum(row.edge, 1)}</td>
                <td>{formatNum(row.actualValue, 1)}</td>
                <td>{row.resultStatus || "-"}</td>
                <td>{formatNum(row.profit1u, 2)}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={9}>No result comparison rows yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LiveMarketCards({ live }: { live: LiveResponse }) {
  const markets = useMemo(() => normalizeLiveMarkets(live), [live]);
  return (
    <div className="marketGrid liveMarkets">
      {markets.map((market) => (
        <div className="marketMini" key={market.key}>
          <span>{market.label}</span>
          <strong>{formatNum(market.line, 1)}</strong>
          <small>proj {formatNum(market.projection, 1)} · edge {formatNum(market.edge, 1)}</small>
          <small>O {formatNum(market.overOdds, 2)} / U {formatNum(market.underOdds, 2)} · {market.pick || "-"}</small>
          <StatusPill label={market.status} tone={market.status === "available" ? "green" : "neutral"} />
        </div>
      ))}
    </div>
  );
}

function LiveThreePmCards({ live, sourceAgeSeconds }: { live: LiveResponse; sourceAgeSeconds: number | null }) {
  const rows = normalizeLiveThreePm(live);
  return (
    <div className="shotGrid liveThreePmGrid">
      {rows.map(({ key, label, item }) => (
        <div className="shotCard" key={key}>
          <div className="panelHeader">
            <span>{label}</span>
            <StatusPill label={key === "total" ? "TOTAL SIGNAL" : "3PM SIGNAL"} tone={key === "total" ? "green" : "purple"} />
          </div>
          {item.available === false ? (
            <small>{item.reason || "Unavailable"}</small>
          ) : (
            <>
              <strong>{formatNum(item.current, 1)} / {formatNum(item.line, 1)}</strong>
              <small>Final {formatNum(asNumber(item.projection_final ?? item.final_projection), 1)} · remaining {formatNum(item.remaining_projection, 1)}</small>
              <small>Edge {formatNum(item.edge, 1)} · pick {item.pick || "-"}</small>
              <small>O {formatNum(item.odds_over, 2)} / U {formatNum(item.odds_under, 2)}</small>
            </>
          )}
          <small>Updated {item.updated_at || live.updated_at || "-"} · age {item.source_age_sec ?? item.source_age_seconds ?? sourceAgeSeconds ?? "-"}s</small>
        </div>
      ))}
    </div>
  );
}

function SignalsPanel({ signals, error }: { signals: SignalResponse; error: boolean }) {
  return (
    <section className="panel" id="signals">
      <div className="panelHeader">
        <h2>Signals</h2>
        <StatusPill label={`${signals.count || 0} SIGNALS`} tone="green" />
      </div>
      {error ? <div className="stateBox danger">Signals temporarily unavailable. Retrying...</div> : null}
      {!signals.items.length ? <div className="emptyCard">No public signals for this match</div> : null}
      <div className="signalGrid">
        {signals.items.map((signal) => (
          <div className="signalCard" key={signalKey(signal)}>
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

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metricCard"><span>{label}</span><strong>{value}</strong></div>;
}

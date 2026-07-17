"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { apiGet, formatNum } from "@/lib/api";
import {
  asNumber,
  isFinishedStatus,
  isLiveStatus,
  normalizeLiveMarkets,
  normalizeLiveThreePm,
  signalKey,
} from "@/lib/matchUtils";
import type { LiveResponse, PostgameResponse, SignalResponse } from "@/lib/matchTypes";
import { StatusPill } from "../StatusPill";

const fetcher = <T,>(path: string) => apiGet<T>(path);

export function LiveMatchCenter({
  gameId,
  initialLive,
  initialSignals,
  initialPostgame,
  initialStatus,
}: {
  gameId: string;
  initialLive: LiveResponse;
  initialSignals: SignalResponse;
  initialPostgame: PostgameResponse;
  initialStatus?: string | null;
}) {
  const [postgame, setPostgame] = useState(initialPostgame);
  const [postgameRefreshed, setPostgameRefreshed] = useState(false);
  const initialPollingStatus = initialLive.status || initialStatus;
  const [livePollMs, setLivePollMs] = useState(pollInterval(initialPollingStatus));

  const liveState = useSWR<LiveResponse>(`/api/v1/public/basket/matches/${gameId}/live`, fetcher, {
    fallbackData: initialLive,
    refreshInterval: livePollMs,
    refreshWhenHidden: true,
    refreshWhenOffline: true,
    dedupingInterval: 0,
    revalidateOnFocus: true,
  });
  const live = liveState.data || initialLive;
  const liveStatus = live.status || initialStatus;
  const interval = pollInterval(liveStatus);
  const signalsState = useSWR<SignalResponse>(`/api/v1/public/basket/matches/${gameId}/signals`, fetcher, {
    fallbackData: initialSignals,
    refreshInterval: livePollMs,
    refreshWhenHidden: true,
    refreshWhenOffline: true,
    dedupingInterval: 0,
    revalidateOnFocus: true,
  });

  const signals = signalsState.data || initialSignals;
  const now = Date.now();
  const updatedAt = live.updated_at ? new Date(live.updated_at).getTime() : null;
  const sourceAgeSeconds = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const stale = sourceAgeSeconds != null && sourceAgeSeconds > Math.max(90, interval / 500);

  useEffect(() => {
    setLivePollMs(pollInterval(liveStatus));
  }, [liveStatus]);

  useEffect(() => {
    if (!postgameRefreshed && isFinishedStatus(live.status || initialStatus)) {
      setPostgameRefreshed(true);
      apiGet<PostgameResponse>(`/api/v1/public/basket/matches/${gameId}/postgame`)
        .then(setPostgame)
        .catch(() => undefined);
    }
  }, [gameId, initialStatus, live.status, postgameRefreshed]);

  return (
    <>
      <section className="panel" id="live-center">
        <div className="panelHeader">
          <h2>Live Center</h2>
          <div className="statusCluster">
            <StatusPill label={isFinishedStatus(live.status || initialStatus) ? "POLLING STOPPED" : `${interval / 1000}s POLL`} tone="neutral" />
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
      <PostgameTelemetry postgame={postgame} />
    </>
  );
}

function pollInterval(status?: string | null): number {
  if (isFinishedStatus(status)) return 0;
  if (isLiveStatus(status)) return 10000;
  return 60000;
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
          <small>Updated {item.updated_at || live.updated_at || "-"} · age {item.source_age_seconds ?? sourceAgeSeconds ?? "-"}s</small>
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

function PostgameTelemetry({ postgame }: { postgame: PostgameResponse }) {
  return <span className="srOnly">Postgame refreshed: {postgame.available ? "yes" : "no"}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metricCard"><span>{label}</span><strong>{value}</strong></div>;
}

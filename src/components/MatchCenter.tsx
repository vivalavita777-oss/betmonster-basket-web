"use client";

import useSWR from "swr";
import Link from "next/link";
import { apiGet, MatchListResponse } from "@/lib/api";
import { addDaysIso } from "@/lib/time";
import { MatchCard } from "./MatchCard";

const fetcher = (path: string) => apiGet<MatchListResponse>(path);

export function MatchCenter({ date, league }: { date: string; league?: "WNBA" | "NBL1" }) {
  const query = league ? `&league=${league}` : "";
  const { data, error, isLoading } = useSWR(`/api/v1/public/basket/matches?date=${date}${query}`, fetcher, {
    refreshInterval: 60000
  });
  const live = data?.items.filter((item) => item.has_live) || [];
  const scheduled = data?.items.filter((item) => !item.has_live && item.public_status !== "finished") || [];
  const finished = data?.items.filter((item) => item.public_status === "finished") || [];

  return (
    <section className="pageStack">
      <div className="filterBar">
        <div className="segmented">
          <Link href={`/basket/${addDaysIso(date, -1)}`}>Yesterday</Link>
          <Link href={`/basket/${date}`}>Today</Link>
          <Link href={`/basket/${addDaysIso(date, 1)}`}>Tomorrow</Link>
        </div>
        <div className="segmented">
          <Link href={`/basket/${date}`}>All</Link>
          <Link href={`/basket/wnba/${date}`}>WNBA</Link>
          <Link href={`/basket/nbl1/${date}`}>NBL1</Link>
        </div>
      </div>
      <div className="sectionHeader">
        <div>
          <h1>Match Center</h1>
          <p>{date} · {league || "All leagues"}</p>
        </div>
        <span className="countBadge">{data?.count ?? 0} matches</span>
      </div>
      {isLoading ? <div className="stateBox">Loading matches...</div> : null}
      {error ? <div className="stateBox danger">API unavailable. Showing no live data.</div> : null}
      <div className="boardGrid">
        <Column title="Live" items={live} empty="No live games right now." />
        <Column title="Scheduled" items={scheduled} empty="No scheduled games." />
        <Column title="Finished" items={finished} empty="No finished games." />
      </div>
    </section>
  );
}

function Column({ title, items, empty }: { title: string; items: MatchListResponse["items"]; empty: string }) {
  return (
    <section className="boardColumn">
      <h2>{title}</h2>
      {items.length ? items.map((match) => <MatchCard key={match.game_id} match={match} />) : <div className="emptyCard">{empty}</div>}
    </section>
  );
}

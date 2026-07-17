import Link from "next/link";
import { MatchItem } from "@/lib/api";
import { StatusPill } from "./StatusPill";

function sourceLabel(match: MatchItem): string {
  const source = match.calculation_source?.toUpperCase() || "NO";
  const roster = match.roster_state?.toUpperCase();
  return roster ? `${source} / ${roster}` : source;
}

export function MatchCard({ match }: { match: MatchItem }) {
  const signal = match.best_public_signal;
  const isLive = Boolean(match.has_live);
  const status = isLive ? "LIVE" : (match.public_status || match.status || "scheduled").toUpperCase();
  return (
    <Link href={`/match/${match.game_id}`} className="matchCard">
      <div className="cardTop">
        <span className="league">{match.league || "Basketball"}</span>
        <StatusPill label={status} tone={isLive ? "red" : "neutral"} />
      </div>
      <div className="teams">
        <strong>{match.home_team || "Home"}</strong>
        <span>vs</span>
        <strong>{match.away_team || "Away"}</strong>
      </div>
      <div className="scoreLine">
        <span>{match.home_score ?? "-"} : {match.away_score ?? "-"}</span>
        <span>{sourceLabel(match)}</span>
      </div>
      {signal ? (
        <div className="signalRow">
          <StatusPill label={signal.market || "Signal"} tone={String(signal.market).includes("3PM") ? "purple" : "green"} />
          <span>{signal.selection || signal.status}</span>
        </div>
      ) : (
        <div className="muted">No public signal</div>
      )}
    </Link>
  );
}

import { apiGet, RecommendationsResponse } from "@/lib/api";
import { RecommendationTable } from "@/components/RecommendationTable";
import { StatusPill } from "@/components/StatusPill";

type MatchDetail = {
  game_id: string;
  league?: string;
  home_team?: string;
  away_team?: string;
  status?: string;
  flags?: { has_live?: boolean; has_postgame?: boolean };
  market?: Record<string, unknown>;
  model_summary?: Record<string, unknown>;
};

export default async function MatchPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const [match, recs, frozen] = await Promise.all([
    apiGet<MatchDetail>(`/api/v1/public/basket/matches/${gameId}`),
    apiGet<RecommendationsResponse>(`/api/v1/public/basket/matches/${gameId}/recommendations`),
    apiGet<{ available: boolean; snapshot_at?: string; items?: RecommendationsResponse["items"] }>(`/api/v1/public/basket/matches/${gameId}/frozen-prematch`)
  ]);
  return (
    <section className="pageStack">
      <div className="detailHero">
        <div>
          <span className="league">{match.league}</span>
          <h1>{match.home_team} vs {match.away_team}</h1>
        </div>
        <StatusPill label={match.flags?.has_live ? "LIVE" : match.status?.toUpperCase()} tone={match.flags?.has_live ? "red" : "neutral"} />
      </div>
      <div className="tabsRow">
        {["Overview", "Prematch", "Live Center", "Markets", "Team Form", "Quarter Profiles", "Shot Markets", "Signals", "Recommendations", "Result"].map((tab) => (
          <a href={`#${tab.toLowerCase().replaceAll(" ", "-")}`} key={tab}>{tab}</a>
        ))}
      </div>
      <section className="panel" id="overview">
        <h2>Overview</h2>
        <pre>{JSON.stringify({ market: match.market, model_summary: match.model_summary }, null, 2)}</pre>
      </section>
      <section className="panel" id="prematch">
        <h2>Frozen Prematch</h2>
        {frozen.available ? <p>Snapshot: {frozen.snapshot_at}</p> : <div className="emptyCard">Frozen prematch snapshot is not available.</div>}
        <RecommendationTable items={frozen.items || []} />
      </section>
      <section className="panel" id="recommendations">
        <h2>Recommendations</h2>
        <RecommendationTable items={recs.items} />
      </section>
      <section className="panel" id="live-center">
        <h2>Live Center</h2>
        <p className="muted">Live polling target: <code>/matches/{gameId}/live</code>. Live games poll every 10 seconds; scheduled games can poll every 60 seconds.</p>
      </section>
    </section>
  );
}

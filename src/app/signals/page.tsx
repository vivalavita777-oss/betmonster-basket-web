import { serverApiGet, RecommendationsResponse } from "@/lib/api";
import { ApiUnavailable } from "@/components/ApiUnavailable";
import { RecommendationTable } from "@/components/RecommendationTable";
import { appTodayIso } from "@/lib/time";

export default async function SignalsPage() {
  let data: RecommendationsResponse;
  try {
    data = await serverApiGet<RecommendationsResponse>(`/api/v1/public/basket/recommendations?date=${appTodayIso()}&limit=50`);
  } catch {
    return <ApiUnavailable title="Signals API unavailable" />;
  }
  return (
    <section className="pageStack">
      <div className="sectionHeader">
        <h1>Signals</h1>
        <span className="countBadge">{data.count}</span>
      </div>
      <RecommendationTable items={data.items} />
    </section>
  );
}

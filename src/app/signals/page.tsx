import { apiGet, RecommendationsResponse, todayIso } from "@/lib/api";
import { RecommendationTable } from "@/components/RecommendationTable";

export default async function SignalsPage() {
  const data = await apiGet<RecommendationsResponse>(`/api/v1/public/basket/recommendations?date=${todayIso()}&limit=50`);
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

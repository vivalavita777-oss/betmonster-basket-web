import { apiGet, PerformanceMetrics } from "@/lib/api";
import { MetricGrid } from "@/components/MetricGrid";

export default async function PerformancePage() {
  const summary = await apiGet<PerformanceMetrics & { cohorts: string[] }>("/api/v1/public/basket/performance");
  const buckets = await apiGet<{ items: Array<PerformanceMetrics & { edge_bucket: string }> }>("/api/v1/public/basket/performance/edge-buckets");
  return (
    <section className="pageStack">
      <div className="sectionHeader">
        <div>
          <h1>Performance</h1>
          <p>Production cohorts: {summary.cohorts?.join(", ")}</p>
        </div>
      </div>
      <MetricGrid metrics={summary} />
      <section className="panel">
        <h2>Edge buckets</h2>
        <div className="bucketGrid">
          {buckets.items.map((bucket) => (
            <div className="metricCard" key={bucket.edge_bucket}>
              <span>{bucket.edge_bucket}</span>
              <strong>{bucket.recommendations}</strong>
              <small>sample size</small>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

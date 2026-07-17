import { PerformanceMetrics, formatNum, formatPct } from "@/lib/api";

const labels: Array<[keyof PerformanceMetrics, string]> = [
  ["recommendations", "Recommendations"],
  ["settled", "Settled"],
  ["open", "Open"],
  ["wins", "Wins"],
  ["losses", "Losses"],
  ["win_rate", "Win rate"],
  ["profit_1u", "Profit 1u"],
  ["roi", "ROI"],
  ["avg_edge", "Avg edge"]
];

export function MetricGrid({ metrics }: { metrics: PerformanceMetrics }) {
  return (
    <div className="metricGrid">
      {labels.map(([key, label]) => {
        const raw = metrics[key];
        const value = key === "win_rate" || key === "roi" ? formatPct(raw as number | null) : typeof raw === "number" ? formatNum(raw, key === "profit_1u" ? 2 : 1) : "-";
        return (
          <div className="metricCard" key={key}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        );
      })}
    </div>
  );
}

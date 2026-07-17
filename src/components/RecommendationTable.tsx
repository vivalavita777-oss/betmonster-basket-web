import { RecommendationItem, formatNum } from "@/lib/api";
import { StatusPill } from "./StatusPill";

export function RecommendationTable({ items }: { items: RecommendationItem[] }) {
  if (!items.length) return <div className="emptyCard">No public recommendations.</div>;
  return (
    <div className="tableScroller">
      <table>
        <thead>
          <tr>
            <th>Market</th>
            <th>Pick</th>
            <th>Line</th>
            <th>Odds</th>
            <th>Edge</th>
            <th>Status</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.game_id}-${item.market}-${index}`}>
              <td>{item.market}</td>
              <td>{item.pick}</td>
              <td>{formatNum(item.line)}</td>
              <td>{formatNum(item.odds, 2)}</td>
              <td>{formatNum(item.edge)}</td>
              <td><StatusPill label={item.status} tone={item.cohort === "research_lean" ? "purple" : "green"} /></td>
              <td>{item.result_status || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

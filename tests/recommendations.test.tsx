import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { MetricGrid } from "@/components/MetricGrid";
import { RecommendationTable, recommendationSourceLabel } from "@/components/RecommendationTable";

describe("recommendation rendering", () => {
  it("renders recommendation rows with CONF source", () => {
    const item = {
      game_id: "game-1",
      market: "Total",
      pick: "OVER",
      line: 166.5,
      odds: 1.85,
      edge: 5.2,
      status: "PLAY_MODEL_CONFIRMED",
      calculation_source: "conf",
      cohort: "production_prematch",
    };

    expect(recommendationSourceLabel(item)).toBe("CONF");
    render(<RecommendationTable items={[item]} />);
    expect(screen.getByText("OVER")).toBeTruthy();
    expect(screen.getByText("CONF")).toBeTruthy();
  });

  it("formats performance metrics", () => {
    render(
      <MetricGrid
        metrics={{
          recommendations: 10,
          settled: 8,
          open: 2,
          wins: 5,
          losses: 3,
          pushes: 0,
          void: 0,
          win_rate: 0.625,
          profit_1u: 2.125,
          roi: 0.2656,
          avg_odds: 1.91,
          avg_edge: 4.4,
          median_edge: 3.7,
        }}
      />
    );

    expect(screen.getByText("62.5%")).toBeTruthy();
    expect(screen.getByText("2.13")).toBeTruthy();
  });
});

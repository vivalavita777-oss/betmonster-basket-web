import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { MatchCard, normalizeMatchStatus, sourceLabel } from "@/components/MatchCard";
import { MatchItem } from "@/lib/api";

const baseMatch: MatchItem = {
  game_id: "game-1",
  league: "NBL1 South Women",
  game_date: "2026-07-18T18:30:00-04:00",
  home_team: "Home Team",
  away_team: "Away Team",
  public_status: "scheduled",
};

describe("MatchCard", () => {
  it("normalizes live status above public status", () => {
    expect(normalizeMatchStatus({ ...baseMatch, has_live: true, public_status: "finished" })).toBe("LIVE");
  });

  it("renders EXP/CONF source badge text", () => {
    expect(sourceLabel({ ...baseMatch, calculation_source: "conf", roster_state: "confirmed" })).toBe("CONF / CONFIRMED");
    render(<MatchCard match={{ ...baseMatch, calculation_source: "exp" }} />);
    expect(screen.getByText("EXP")).toBeTruthy();
  });
});

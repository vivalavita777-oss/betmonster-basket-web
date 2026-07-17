import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiGetMock } = vi.hoisted(() => ({ apiGetMock: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: apiGetMock };
});

import { LiveMatchCenter, LiveMatchProvider } from "@/components/match/LiveMatchCenter";
import type { LiveResponse, SignalResponse } from "@/lib/matchTypes";

const live: LiveResponse = { game_id: "g1", available: false, status: "scheduled" };

describe("SignalsPanel", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it("shows valid empty state without unavailable error", () => {
    apiGetMock.mockResolvedValue(live);
    const signals: SignalResponse = { game_id: "g1", available: true, count: 0, reason: "no_public_signals", items: [] };

    render(
      <LiveMatchProvider gameId="g1" initialLive={live} initialSignals={signals} initialStatus="scheduled">
        <LiveMatchCenter />
      </LiveMatchProvider>,
    );

    expect(screen.getByText("No public signals for this match")).toBeTruthy();
    expect(screen.queryByText("Signals temporarily unavailable")).toBeNull();
  });

  it("shows unavailable error without valid empty state", async () => {
    apiGetMock.mockRejectedValue(new Error("signals down"));
    const signals: SignalResponse = { game_id: "g1", available: true, count: 0, reason: "no_public_signals", items: [] };

    render(
      <LiveMatchProvider gameId="g1" initialLive={live} initialSignals={signals} initialStatus="scheduled">
        <LiveMatchCenter />
      </LiveMatchProvider>,
    );

    await waitFor(() => expect(screen.getByText("Signals temporarily unavailable")).toBeTruthy());
    expect(screen.queryByText("No public signals for this match")).toBeNull();
    expect(screen.getByText("Retry")).toBeTruthy();
  });
});

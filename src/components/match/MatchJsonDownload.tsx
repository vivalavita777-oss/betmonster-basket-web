"use client";

import type { ApiObject } from "@/lib/matchTypes";

export function MatchJsonDownload({ payload, compactPayload }: { payload: ApiObject; compactPayload?: ApiObject }) {
  function downloadJson(kind: "full" | "compact") {
    const source = kind === "compact" && compactPayload ? compactPayload : payload;
    const runtimePayload = { ...source, current_client_time: new Date().toISOString() };
    const gameId = String(payload.game_id || "match");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(runtimePayload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `basket_match_${gameId}_${kind}_${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button className="tabActionButton" type="button" onClick={() => downloadJson("full")}>
        JSON FULL
      </button>
      <button className="tabActionButton" type="button" onClick={() => downloadJson("compact")}>
        JSON COMPACT
      </button>
    </>
  );
}

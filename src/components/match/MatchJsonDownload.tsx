"use client";

import type { ApiObject } from "@/lib/matchTypes";

export function MatchJsonDownload({ payload }: { payload: ApiObject }) {
  function downloadJson() {
    const gameId = String(payload.game_id || "match");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `basket_match_${gameId}_${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button className="tabActionButton" type="button" onClick={downloadJson}>
      JSON
    </button>
  );
}

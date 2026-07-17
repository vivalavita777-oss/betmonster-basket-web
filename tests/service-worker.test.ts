import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("service worker API strategy", () => {
  const source = readFileSync("public/sw.js", "utf-8");

  it("uses v3 caches", () => {
    expect(source).toContain("basket-monster-shell-v3");
    expect(source).toContain("basket-monster-static-v3");
    expect(source).toContain("basket-monster-pages-v3");
  });

  it("keeps backend API requests network-only", () => {
    expect(source).toContain('url.pathname.startsWith("/api/backend/")');
    expect(source).toContain("event.respondWith(fetch(event.request))");
    expect(source).not.toContain("isNetworkOnlyApi");
  });
});

import { describe, expect, it } from "vitest";
import { buildFreshnessBanner, isGraphFreshnessResult } from "../StalenessBanner";

describe("buildFreshnessBanner", () => {
  it("returns no banner for fresh or missing freshness data", () => {
    expect(buildFreshnessBanner(null)).toBeNull();
    expect(
      buildFreshnessBanner({
        status: "fresh",
        graphCommitHash: "abc123",
        headCommitHash: "abc123",
        changedFileCount: 0,
        changedFiles: [],
        commitsBehind: 0,
      }),
    ).toBeNull();
  });

  it("summarizes stale graph state with commit and file counts", () => {
    const banner = buildFreshnessBanner({
      status: "stale",
      graphCommitHash: "graph-commit",
      headCommitHash: "head-commit",
      changedFileCount: 2,
      changedFiles: ["src/auth.ts", "src/routes.ts"],
      commitsBehind: 3,
      lastAnalyzedAt: "2026-07-08T08:00:00.000Z",
    });

    expect(banner).toEqual({
      title: "Knowledge graph may be stale",
      summary:
        "The graph was generated 3 commits before HEAD and 2 files have changed since analysis.",
      action: "Run /understand to refresh it before relying on impact or onboarding answers.",
      changedFiles: ["src/auth.ts", "src/routes.ts"],
    });
  });

  it("explains unknown freshness when commit metadata is missing", () => {
    const banner = buildFreshnessBanner({
      status: "unknown",
      reason: "missing-graph-commit",
      lastAnalyzedAt: "2026-07-08T08:00:00.000Z",
    });

    expect(banner).toEqual({
      title: "Graph freshness could not be verified",
      summary: "The graph does not include a git commit hash to compare with HEAD.",
      action: "Run /understand to regenerate the graph with current git metadata.",
      changedFiles: [],
    });
  });

  it("recognizes graph freshness payloads from the dashboard endpoint", () => {
    expect(isGraphFreshnessResult({ status: "fresh" })).toBe(true);
    expect(isGraphFreshnessResult({ status: "stale" })).toBe(true);
    expect(isGraphFreshnessResult({ status: "unknown" })).toBe(true);
    expect(isGraphFreshnessResult({ error: "Forbidden" })).toBe(false);
    expect(isGraphFreshnessResult(null)).toBe(false);
  });
});

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

const execFileSyncMock = vi.mocked(execFileSync);

async function loadHelpers() {
  return import("../../vite.config");
}

describe("dashboard graph freshness endpoint helper", () => {
  let originalGraphDir: string | undefined;
  let tempProject: string;

  beforeEach(() => {
    vi.resetModules();
    execFileSyncMock.mockReset();
    originalGraphDir = process.env.GRAPH_DIR;
    tempProject = fs.mkdtempSync(path.join(os.tmpdir(), "ua-dashboard-"));
    process.env.GRAPH_DIR = tempProject;
  });

  afterEach(() => {
    if (originalGraphDir === undefined) {
      delete process.env.GRAPH_DIR;
    } else {
      process.env.GRAPH_DIR = originalGraphDir;
    }
    fs.rmSync(tempProject, { recursive: true, force: true });
  });

  it("reports a stale graph from knowledge graph commit metadata", async () => {
    const graphDir = path.join(tempProject, ".understand-anything");
    fs.mkdirSync(graphDir, { recursive: true });
    fs.writeFileSync(
      path.join(graphDir, "knowledge-graph.json"),
      JSON.stringify({
        project: {
          gitCommitHash: "graph-commit",
          analyzedAt: "2026-07-08T08:00:00.000Z",
        },
      }),
    );

    execFileSyncMock.mockImplementation((_cmd, args) => {
      const joinedArgs = Array.isArray(args) ? args.join(" ") : "";
      if (joinedArgs === "rev-parse HEAD") return "head-commit\n";
      if (joinedArgs === "rev-list --count graph-commit..HEAD") return "3\n";
      if (joinedArgs === "diff graph-commit..HEAD --name-only") {
        return "src/auth.ts\nsrc/routes.ts\n";
      }
      throw new Error(`Unexpected git command: ${joinedArgs}`);
    });

    const { readGraphFreshness } = await loadHelpers();

    expect(readGraphFreshness()).toEqual({
      statusCode: 200,
      payload: {
        status: "stale",
        graphCommitHash: "graph-commit",
        headCommitHash: "head-commit",
        changedFileCount: 2,
        changedFiles: ["src/auth.ts", "src/routes.ts"],
        commitsBehind: 3,
        lastAnalyzedAt: "2026-07-08T08:00:00.000Z",
      },
    });
  });

  it("returns a 404 payload when no knowledge graph exists", async () => {
    const { readGraphFreshness } = await loadHelpers();

    expect(readGraphFreshness()).toEqual({
      statusCode: 404,
      payload: { error: "No knowledge graph found. Run /understand first." },
    });
  });

  it("returns a 500 payload when the knowledge graph cannot be parsed", async () => {
    const graphDir = path.join(tempProject, ".understand-anything");
    fs.mkdirSync(graphDir, { recursive: true });
    fs.writeFileSync(path.join(graphDir, "knowledge-graph.json"), "{not-json");

    const { readGraphFreshness } = await loadHelpers();

    expect(readGraphFreshness()).toEqual({
      statusCode: 500,
      payload: { error: "Failed to read graph file" },
    });
  });
});

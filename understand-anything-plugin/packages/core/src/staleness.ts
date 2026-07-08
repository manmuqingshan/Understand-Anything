import { execFileSync } from "child_process";
import type { KnowledgeGraph, GraphNode, GraphEdge } from "./types.js";

export interface StalenessResult {
  stale: boolean;
  changedFiles: string[];
}

export type GraphFreshnessResult =
  | {
      status: "fresh";
      graphCommitHash: string;
      headCommitHash: string;
      changedFileCount: 0;
      changedFiles: [];
      commitsBehind: 0;
      lastAnalyzedAt?: string;
    }
  | {
      status: "stale";
      graphCommitHash: string;
      headCommitHash: string;
      changedFileCount: number;
      changedFiles: string[];
      commitsBehind: number;
      lastAnalyzedAt?: string;
    }
  | {
      status: "unknown";
      reason:
        | "missing-graph-commit"
        | "git-head-unavailable"
        | "graph-commit-unavailable";
      graphCommitHash?: string;
      headCommitHash?: string;
      lastAnalyzedAt?: string;
    };

export interface GraphFreshnessInput {
  graphCommitHash?: string | null;
  lastAnalyzedAt?: string;
}

function runGit(projectDir: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: projectDir,
    encoding: "utf-8",
  }).trim();
}

function parseChangedFiles(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Get the list of files that changed between a given commit and HEAD.
 * Returns an empty array if there are no changes or if git encounters an error.
 */
export function getChangedFiles(
  projectDir: string,
  lastCommitHash: string,
): string[] {
  try {
    const output = execFileSync("git", ["diff", `${lastCommitHash}..HEAD`, "--name-only"], {
      cwd: projectDir,
      encoding: "utf-8",
    });
    return parseChangedFiles(output);
  } catch {
    return [];
  }
}

/**
 * Check whether the knowledge graph is stale relative to the current HEAD.
 */
export function isStale(
  projectDir: string,
  lastCommitHash: string,
): StalenessResult {
  const changedFiles = getChangedFiles(projectDir, lastCommitHash);
  return {
    stale: changedFiles.length > 0,
    changedFiles,
  };
}

/**
 * Describe whether a persisted graph can still be trusted for the current HEAD.
 *
 * Unknown is intentionally distinct from fresh: if git metadata cannot be read,
 * callers should warn softly rather than imply the graph is current.
 */
export function getGraphFreshness(
  projectDir: string,
  input: GraphFreshnessInput,
): GraphFreshnessResult {
  const graphCommitHash = input.graphCommitHash?.trim();
  if (!graphCommitHash) {
    return {
      status: "unknown",
      reason: "missing-graph-commit",
      lastAnalyzedAt: input.lastAnalyzedAt,
    };
  }

  let headCommitHash: string;
  try {
    headCommitHash = runGit(projectDir, ["rev-parse", "HEAD"]);
  } catch {
    return {
      status: "unknown",
      reason: "git-head-unavailable",
      graphCommitHash,
      lastAnalyzedAt: input.lastAnalyzedAt,
    };
  }

  if (headCommitHash === graphCommitHash) {
    return {
      status: "fresh",
      graphCommitHash,
      headCommitHash,
      changedFileCount: 0,
      changedFiles: [],
      commitsBehind: 0,
      lastAnalyzedAt: input.lastAnalyzedAt,
    };
  }

  try {
    const commitsBehind = Number.parseInt(
      runGit(projectDir, ["rev-list", "--count", `${graphCommitHash}..HEAD`]),
      10,
    );
    const changedFiles = parseChangedFiles(
      runGit(projectDir, ["diff", `${graphCommitHash}..HEAD`, "--name-only"]),
    );
    return {
      status: "stale",
      graphCommitHash,
      headCommitHash,
      changedFileCount: changedFiles.length,
      changedFiles,
      commitsBehind: Number.isFinite(commitsBehind) ? commitsBehind : 0,
      lastAnalyzedAt: input.lastAnalyzedAt,
    };
  } catch {
    return {
      status: "unknown",
      reason: "graph-commit-unavailable",
      graphCommitHash,
      headCommitHash,
      lastAnalyzedAt: input.lastAnalyzedAt,
    };
  }
}

/**
 * Merge new analysis results into an existing knowledge graph.
 *
 * 1. Remove old nodes belonging to changed files (matched by filePath).
 * 2. Remove old edges where the SOURCE or TARGET node belongs to a changed file.
 * 3. Add new nodes and edges.
 * 4. Update project.gitCommitHash and project.analyzedAt.
 * 5. Return the merged graph.
 */
export function mergeGraphUpdate(
  existingGraph: KnowledgeGraph,
  changedFilePaths: string[],
  newNodes: GraphNode[],
  newEdges: GraphEdge[],
  newCommitHash: string,
): KnowledgeGraph {
  const changedSet = new Set(changedFilePaths);

  // Collect IDs of nodes that belong to changed files (will be removed)
  const removedNodeIds = new Set(
    existingGraph.nodes
      .filter((node) => node.filePath !== undefined && changedSet.has(node.filePath))
      .map((node) => node.id),
  );

  // Keep nodes that don't belong to changed files
  const retainedNodes = existingGraph.nodes.filter(
    (node) => !removedNodeIds.has(node.id),
  );

  // Keep edges whose source or target node is not in the removed set
  const retainedEdges = existingGraph.edges.filter(
    (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target),
  );

  return {
    ...existingGraph,
    project: {
      ...existingGraph.project,
      gitCommitHash: newCommitHash,
      analyzedAt: new Date().toISOString(),
    },
    nodes: [...retainedNodes, ...newNodes],
    edges: [...retainedEdges, ...newEdges],
  };
}

import { useState } from "react";

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
type UnknownGraphFreshnessReason = Extract<
  GraphFreshnessResult,
  { status: "unknown" }
>["reason"];

interface StalenessBannerProps {
  freshness: GraphFreshnessResult | null;
}

interface FreshnessBannerContent {
  title: string;
  summary: string;
  action: string;
  changedFiles: string[];
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function isGraphFreshnessResult(data: unknown): data is GraphFreshnessResult {
  if (!data || typeof data !== "object") return false;
  const status = (data as { status?: unknown }).status;
  return status === "fresh" || status === "stale" || status === "unknown";
}

export function buildFreshnessBanner(
  freshness: GraphFreshnessResult | null,
): FreshnessBannerContent | null {
  if (!freshness || freshness.status === "fresh") return null;

  if (freshness.status === "stale") {
    return {
      title: "Knowledge graph may be stale",
      summary: `The graph was generated ${plural(
        freshness.commitsBehind,
        "commit",
      )} before HEAD and ${plural(
        freshness.changedFileCount,
        "file",
      )} have changed since analysis.`,
      action: "Run /understand to refresh it before relying on impact or onboarding answers.",
      changedFiles: freshness.changedFiles,
    };
  }

  const summaryByReason: Record<UnknownGraphFreshnessReason, string> = {
    "missing-graph-commit": "The graph does not include a git commit hash to compare with HEAD.",
    "git-head-unavailable": "The dashboard could not read git HEAD for this project.",
    "graph-commit-unavailable": "The graph commit is not available in this checkout.",
  };

  return {
    title: "Graph freshness could not be verified",
    summary: summaryByReason[freshness.reason],
    action: "Run /understand to regenerate the graph with current git metadata.",
    changedFiles: [],
  };
}

export default function StalenessBanner({ freshness }: StalenessBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const content = buildFreshnessBanner(freshness);

  if (!content) return null;

  const hasFiles = content.changedFiles.length > 0;
  const visibleFiles = content.changedFiles.slice(0, 8);
  const hiddenFileCount = content.changedFiles.length - visibleFiles.length;

  return (
    <div className="bg-amber-950/30 border-b border-amber-700 text-amber-100 text-sm">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-amber-900/10 transition-colors"
      >
        <svg
          className="w-4 h-4 shrink-0 mt-0.5 text-amber-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          />
        </svg>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold">{content.title}</span>
          <span className="block text-amber-100/80">{content.summary}</span>
          <span className="block text-amber-100/70">{content.action}</span>
        </span>
        {hasFiles && (
          <span className="text-xs text-amber-300/70 shrink-0">
            {expanded ? "hide files" : "show files"}
          </span>
        )}
      </button>

      {expanded && hasFiles && (
        <div className="px-5 pb-3">
          <div className="border-t border-amber-700/40 pt-2 flex flex-wrap gap-1.5">
            {visibleFiles.map((file) => (
              <code
                key={file}
                className="px-1.5 py-0.5 rounded bg-amber-900/30 text-[11px] text-amber-100"
              >
                {file}
              </code>
            ))}
            {hiddenFileCount > 0 && (
              <span className="text-xs text-amber-200/60">
                +{hiddenFileCount} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

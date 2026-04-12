import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
} from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import CustomNode from "./CustomNode";
import type { CustomNodeData } from "./CustomNode";
import { useDashboardStore } from "../store";
import { applyForceLayout, NODE_WIDTH, NODE_HEIGHT } from "../utils/layout";
import type { KnowledgeGraph } from "@understand-anything/core/types";

const nodeTypes = {
  custom: CustomNode,
};

/** Edge style presets by knowledge edge type. */
const EDGE_STYLES: Record<string, React.CSSProperties> = {
  related: { stroke: "var(--color-border-medium)", strokeWidth: 0.5, opacity: 0.12 },
  cites: { stroke: "var(--color-node-source)", strokeWidth: 1.5, strokeDasharray: "6 3" },
  contradicts: { stroke: "#c97070", strokeWidth: 2 },
  builds_on: { stroke: "var(--color-node-claim)", strokeWidth: 1.5 },
  exemplifies: { stroke: "var(--color-node-entity)", strokeWidth: 1, strokeDasharray: "3 3" },
  categorized_under: { stroke: "var(--color-border-medium)", strokeWidth: 0.5, opacity: 0.08 },
  authored_by: { stroke: "var(--color-node-entity)", strokeWidth: 1, strokeDasharray: "4 4" },
  implements: { stroke: "var(--color-node-function)", strokeWidth: 1, opacity: 0.4 },
  depends_on: { stroke: "var(--color-node-module)", strokeWidth: 1, opacity: 0.4 },
};

/** Compute node size based on connection count. */
function getNodeDimensions(
  edgeCount: number,
): { width: number; height: number } {
  // Scale width/height by degree (connections)
  const scale = Math.min(1.5, Math.max(0.85, 0.85 + edgeCount * 0.03));
  return {
    width: Math.round(NODE_WIDTH * scale),
    height: Math.round(NODE_HEIGHT * scale),
  };
}

function buildKnowledgeGraph(
  graph: KnowledgeGraph,
  selectedNodeId: string | null,
  focusNodeId: string | null,
  searchResults: Map<string, number>,
  tourHighlightedNodeIds: Set<string>,
  onNodeClick: (nodeId: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  // Count edges per node for degree-proportional sizing
  const edgeCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    edgeCounts.set(edge.source, (edgeCounts.get(edge.source) ?? 0) + 1);
    edgeCounts.set(edge.target, (edgeCounts.get(edge.target) ?? 0) + 1);
  }

  // Build community map from layers
  const communityMap = new Map<string, number>();
  graph.layers.forEach((layer, i) => {
    for (const nodeId of layer.nodeIds) {
      communityMap.set(nodeId, i);
    }
  });

  // Determine neighbor IDs for focus/selection fading
  const neighborIds = new Set<string>();
  if (focusNodeId || selectedNodeId) {
    const focusId = focusNodeId ?? selectedNodeId;
    for (const edge of graph.edges) {
      if (edge.source === focusId) neighborIds.add(edge.target);
      if (edge.target === focusId) neighborIds.add(edge.source);
    }
  }

  // Build node dimensions map
  const dims = new Map<string, { width: number; height: number }>();
  for (const node of graph.nodes) {
    const d = getNodeDimensions(edgeCounts.get(node.id) ?? 0);
    dims.set(node.id, d);
  }

  // Build xyflow nodes
  const rfNodes: Node[] = graph.nodes.map((node) => {
    const isSelected = node.id === selectedNodeId;
    const isFocused = node.id === focusNodeId;
    const isNeighbor = neighborIds.has(node.id);
    const isSelectionFaded =
      (focusNodeId || selectedNodeId) &&
      !isSelected &&
      !isFocused &&
      !isNeighbor;
    const searchScore = searchResults.get(node.id);
    const isHighlighted = searchScore !== undefined;
    const isTourHighlighted = tourHighlightedNodeIds.has(node.id);

    const data: CustomNodeData = {
      label: node.name,
      nodeType: node.type,
      summary: node.summary,
      complexity: node.complexity,
      isHighlighted,
      searchScore,
      isSelected,
      isTourHighlighted,
      isDiffChanged: false,
      isDiffAffected: false,
      isDiffFaded: false,
      isNeighbor,
      isSelectionFaded: !!isSelectionFaded,
      onNodeClick,
      incomingCount: edgeCounts.get(node.id) ?? 0,
      tags: node.tags,
    };

    return {
      id: node.id,
      type: "custom" as const,
      position: { x: 0, y: 0 },
      data,
    };
  });

  // Build xyflow edges
  const rfEdges: Edge[] = graph.edges.map((e, i) => {
    const style = EDGE_STYLES[e.type] ?? EDGE_STYLES.related;
    return {
      id: `ke-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      style,
      animated: e.type === "contradicts",
      label: e.type !== "related" && e.type !== "categorized_under" ? e.type.replace(/_/g, " ") : undefined,
      labelStyle: { fill: "var(--color-text-muted)", fontSize: 9, opacity: 0.7 },
      labelBgStyle: { fill: "var(--color-surface)", fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
    };
  });

  // Apply force layout with community clustering
  return applyForceLayout(rfNodes, rfEdges, dims, communityMap);
}

function KnowledgeGraphViewInner() {
  const graph = useDashboardStore((s) => s.graph);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const focusNodeId = useDashboardStore((s) => s.focusNodeId);
  const selectNode = useDashboardStore((s) => s.selectNode);
  const searchResultsRaw = useDashboardStore((s) => s.searchResults);
  const tourHighlightedNodeIds = useDashboardStore((s) => s.tourHighlightedNodeIds);
  const nodeTypeFilters = useDashboardStore((s) => s.nodeTypeFilters);

  const onNodeClick = useCallback(
    (nodeId: string) => selectNode(nodeId),
    [selectNode],
  );

  const searchResults = useMemo(
    () => new Map(searchResultsRaw.map((r) => [r.nodeId, r.score])),
    [searchResultsRaw],
  );

  const tourSet = useMemo(
    () => new Set(tourHighlightedNodeIds),
    [tourHighlightedNodeIds],
  );

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };

    // Filter graph by active node type filters
    const filteredNodes = graph.nodes.filter((n) => {
      if (["article", "entity", "topic", "claim", "source"].includes(n.type)) {
        return nodeTypeFilters.knowledge !== false;
      }
      return true;
    });

    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = graph.edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
    );

    const filteredGraph: KnowledgeGraph = {
      ...graph,
      nodes: filteredNodes,
      edges: filteredEdges,
    };

    return buildKnowledgeGraph(
      filteredGraph,
      selectedNodeId,
      focusNodeId,
      searchResults,
      tourSet,
      onNodeClick,
    );
  }, [graph, selectedNodeId, focusNodeId, searchResults, tourSet, onNodeClick, nodeTypeFilters]);

  if (!graph) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        No knowledge graph available. Run /understand-knowledge to generate one.
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-border-subtle)"
        />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const data = n.data as CustomNodeData | undefined;
            const type = data?.nodeType ?? "article";
            const colorMap: Record<string, string> = {
              article: "var(--color-node-article)",
              entity: "var(--color-node-entity)",
              topic: "var(--color-node-topic)",
              claim: "var(--color-node-claim)",
              source: "var(--color-node-source)",
            };
            return colorMap[type] ?? "var(--color-accent)";
          }}
          maskColor="var(--glass-bg)"
          className="!bg-surface !border !border-border-subtle"
        />
      </ReactFlow>
    </div>
  );
}

export default function KnowledgeGraphView() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphViewInner />
    </ReactFlowProvider>
  );
}

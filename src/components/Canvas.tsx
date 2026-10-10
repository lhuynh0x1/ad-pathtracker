import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGraphStore } from "../store/useGraphStore";
import { ADEntityNode } from "./nodes/ADEntityNode";
import { SubnetNode } from "./nodes/SubnetNode";
import { LabeledEdge } from "./edges/LabeledEdge";
import { FloatingConnectionLine } from "./edges/FloatingConnectionLine";
import type { ADNodeKind } from "../types/entities";

const ENTITY_KINDS: ADNodeKind[] = [
  "forest",
  "domain",
  "computer",
  "domain-controller",
  "user",
  "group",
];

const edgeTypes: EdgeTypes = { adedge: LabeledEdge };

export function Canvas() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onConnect = useGraphStore((s) => s.onConnect);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selectEdge = useGraphStore((s) => s.selectEdge);
  const attachUserToHost = useGraphStore((s) => s.attachUserToHost);
  const detachUserFromHost = useGraphStore((s) => s.detachUserFromHost);
  const { getIntersectingNodes, getInternalNode } = useReactFlow();

  const handleNodeDragStop = (_: unknown, node: Node) => {
    if (node.data.kind !== "user") return;
    // `node.position` here is relative to its parent (if any), but we need
    // an absolute rect to test against other nodes — read it from the
    // internal node state instead of the (possibly parent-relative) event payload.
    const internal = getInternalNode(node.id);
    if (!internal) return;
    const { x, y } = internal.internals.positionAbsolute;
    const rect = { x, y, width: internal.measured.width ?? 170, height: internal.measured.height ?? 60 };

    const host = getIntersectingNodes(rect).find(
      (n) => n.type === "computer" || n.type === "domain-controller"
    );
    if (host) {
      attachUserToHost(node.id, host.id);
    } else if (node.parentId) {
      detachUserFromHost(node.id);
    }
  };

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      ...Object.fromEntries(ENTITY_KINDS.map((kind) => [kind, ADEntityNode])),
      subnet: SubnetNode,
    }),
    []
  ) as NodeTypes;

  // React Flow requires a parent node to appear before its children in the
  // array — and containment now nests two levels deep (subnet > host >
  // user), so sort topologically rather than assuming a fixed node-type order.
  const orderedNodes = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const placed = new Set<string>();
    const result: typeof nodes = [];
    const visit = (n: (typeof nodes)[number]) => {
      if (placed.has(n.id)) return;
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      if (parent) visit(parent);
      placed.add(n.id);
      result.push(n);
    };
    nodes.forEach(visit);
    return result;
  }, [nodes]);

  return (
    <ReactFlow
      nodes={orderedNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      connectionLineComponent={FloatingConnectionLine}
      connectionMode={ConnectionMode.Loose}
      deleteKeyCode={["Backspace", "Delete"]}
      onNodeClick={(_, node) => selectNode(node.id)}
      onNodeDragStop={handleNodeDragStop}
      onEdgeClick={(_, edge) => selectEdge(edge.id)}
      onPaneClick={() => {
        selectNode(null);
        selectEdge(null);
      }}
      fitView
      colorMode="dark"
      minZoom={0.05}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} color="#2a2f3a" gap={20} />
      <Controls />
      <MiniMap
        style={{ backgroundColor: "#11141c" }}
        maskColor="rgba(11,14,20,0.6)"
        nodeColor="#3b82f6"
      />
    </ReactFlow>
  );
}

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGraphStore } from "../store/useGraphStore";
import { ADEntityNode } from "./nodes/ADEntityNode";
import { SubnetNode } from "./nodes/SubnetNode";
import { LabeledEdge } from "./edges/LabeledEdge";
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

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      ...Object.fromEntries(ENTITY_KINDS.map((kind) => [kind, ADEntityNode])),
      subnet: SubnetNode,
    }),
    []
  ) as NodeTypes;

  // Subnet containers must render (and sit in the DOM) before the entity
  // nodes placed visually inside them so they stay behind as a backdrop.
  const orderedNodes = useMemo(() => {
    const subnets = nodes.filter((n) => n.type === "subnet");
    const rest = nodes.filter((n) => n.type !== "subnet");
    return [...subnets, ...rest];
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
      connectionMode={ConnectionMode.Loose}
      deleteKeyCode={["Backspace", "Delete"]}
      onNodeClick={(_, node) => selectNode(node.id)}
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

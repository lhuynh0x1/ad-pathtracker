import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { useGraphStore } from "../../store/useGraphStore";
import { bowedPath, getFloatingEdgeParams } from "./floating";

export function LabeledEdge({ source, target, style, markerEnd, label, selected, id }: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const deleteEdge = useGraphStore((s) => s.deleteEdge);
  const selectEdge = useGraphStore((s) => s.selectEdge);

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty } = getFloatingEdgeParams(sourceNode, targetNode);
  // Seeded by the node-id pair (not the edge's own id) so the live
  // connection-drag preview — which doesn't have an edge id yet — bows the
  // same way the final edge will, with no visible "flip" on completion.
  const { path: edgePath, labelX, labelY } = bowedPath(sx, sy, tx, ty, source + target);

  const active = hovered || selected;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {/* Wide invisible path to make hovering/clicking the edge easier than the thin visible line. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => selectEdge(id)}
      />
      <EdgeLabelRenderer>
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: active ? "all" : "none",
            zIndex: 10000,
          }}
          className={`nodrag nopan flex items-center gap-1 rounded border text-[11px] font-medium text-gray-100 shadow-lg transition-opacity duration-150 ${
            active ? "border-gray-600 bg-[#1a1e29] px-1.5 py-0.5 opacity-100" : "opacity-0"
          }`}
        >
          <button
            onClick={() => selectEdge(id)}
            className="max-w-[140px] truncate"
            title="Click to edit this relationship"
          >
            {typeof label === "string" && label ? label : "Relationship"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteEdge(id);
            }}
            title="Delete relationship"
            className="flex items-center justify-center rounded-full bg-red-600/90 p-0.5 text-white hover:bg-red-500"
          >
            <X size={10} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

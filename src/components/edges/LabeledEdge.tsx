import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { useGraphStore } from "../../store/useGraphStore";
import { getFloatingEdgeParams } from "./floating";

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function LabeledEdge({ id, source, target, style, markerEnd, label, selected }: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const deleteEdge = useGraphStore((s) => s.deleteEdge);
  const selectEdge = useGraphStore((s) => s.selectEdge);

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty } = getFloatingEdgeParams(sourceNode, targetNode);

  // Bow the curve away from the straight line between the two nodes so it
  // never visually cuts through a third node that happens to sit between
  // them, and so edges sharing a pair of nodes fan out instead of overlapping.
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const sign = hashStr(id) % 2 === 0 ? 1 : -1;
  const bow = Math.min(70, Math.max(18, dist * 0.18)) * sign;
  const mx = (sx + tx) / 2 + nx * bow;
  const my = (sy + ty) / 2 + ny * bow;
  const edgePath = `M ${sx},${sy} Q ${mx},${my} ${tx},${ty}`;
  // Point on the quadratic curve at t=0.5.
  const labelX = 0.25 * sx + 0.5 * mx + 0.25 * tx;
  const labelY = 0.25 * sy + 0.5 * my + 0.25 * ty;

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

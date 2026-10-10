import type { ConnectionLineComponentProps } from "@xyflow/react";
import { bowedPath, getFloatingEdgeParams, intersectionPoint, rectOf } from "./floating";

// Mirrors LabeledEdge's floating + bowed geometry for the in-progress
// connection drag, so the preview looks like the edge you're about to get —
// no straight "stiff" line that then jumps/bows once you drop it.
export function FloatingConnectionLine({ fromNode, toNode, toX, toY, connectionLineStyle }: ConnectionLineComponentProps) {
  if (!fromNode) return null;

  let sx: number, sy: number, tx: number, ty: number, seed: string;

  if (toNode) {
    const params = getFloatingEdgeParams(fromNode, toNode);
    sx = params.sx;
    sy = params.sy;
    tx = params.tx;
    ty = params.ty;
    seed = fromNode.id + toNode.id;
  } else {
    const start = intersectionPoint(rectOf(fromNode), { x: toX, y: toY });
    sx = start.x;
    sy = start.y;
    tx = toX;
    ty = toY;
    seed = fromNode.id;
  }

  const { path } = bowedPath(sx, sy, tx, ty, seed);

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={2}
        strokeDasharray="5 3"
        style={connectionLineStyle}
      />
      <circle cx={tx} cy={ty} r={4} fill="#0b0e14" stroke="#3b82f6" strokeWidth={1.5} />
    </g>
  );
}

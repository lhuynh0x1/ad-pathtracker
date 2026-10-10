import type { InternalNode } from "@xyflow/react";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Finds the point where the straight line from `rect`'s center to `toward`
// crosses `rect`'s own border — this is what makes a "floating" edge always
// approach a node from whichever side actually faces the other end, instead
// of a side baked into a specific handle.
export function intersectionPoint(rect: Rect, toward: { x: number; y: number }) {
  const w = rect.width / 2;
  const h = rect.height / 2;
  const x2 = rect.x + w;
  const y2 = rect.y + h;
  const x1 = toward.x;
  const y1 = toward.y;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

export function rectOf(node: InternalNode): Rect {
  return {
    ...node.internals.positionAbsolute,
    width: node.measured.width ?? 170,
    height: node.measured.height ?? 60,
  };
}

function centerOf(rect: Rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function getFloatingEdgeParams(source: InternalNode, target: InternalNode) {
  const sourceRect = rectOf(source);
  const targetRect = rectOf(target);
  const sourceIntersection = intersectionPoint(sourceRect, centerOf(targetRect));
  const targetIntersection = intersectionPoint(targetRect, centerOf(sourceRect));

  return {
    sx: sourceIntersection.x,
    sy: sourceIntersection.y,
    tx: targetIntersection.x,
    ty: targetIntersection.y,
  };
}

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Shared bow computation so the live connection-drag preview and the final
// rendered edge curve the same way — using the node-id pair (known on both
// ends) rather than the edge's own id (which doesn't exist yet mid-drag)
// means the curve never visibly "flips" the instant you complete a connection.
export function bowedPath(sx: number, sy: number, tx: number, ty: number, seed: string) {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const sign = hashStr(seed) % 2 === 0 ? 1 : -1;
  const bow = Math.min(70, Math.max(18, dist * 0.18)) * sign;
  const mx = (sx + tx) / 2 + nx * bow;
  const my = (sy + ty) / 2 + ny * bow;
  const path = `M ${sx},${sy} Q ${mx},${my} ${tx},${ty}`;
  // Point on the quadratic curve at t=0.5.
  const labelX = 0.25 * sx + 0.5 * mx + 0.25 * tx;
  const labelY = 0.25 * sy + 0.5 * my + 0.25 * ty;
  return { path, labelX, labelY };
}

import type { InternalNode } from "@xyflow/react";

// Finds the point where the straight line between two node centers crosses
// `intersectionNode`'s rectangle border — this is what makes a "floating"
// edge always approach a node from whichever side actually faces the other
// node, instead of a side baked into a specific handle.
function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode) {
  const { width, height } = intersectionNode.measured;
  const w = (width ?? 170) / 2;
  const h = (height ?? 60) / 2;
  const nodePos = intersectionNode.internals.positionAbsolute;
  const targetPos = targetNode.internals.positionAbsolute;
  const targetWidth = targetNode.measured.width ?? 170;
  const targetHeight = targetNode.measured.height ?? 60;

  const x2 = nodePos.x + w;
  const y2 = nodePos.y + h;
  const x1 = targetPos.x + targetWidth / 2;
  const y1 = targetPos.y + targetHeight / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

export function getFloatingEdgeParams(source: InternalNode, target: InternalNode) {
  const sourceIntersection = getNodeIntersection(source, target);
  const targetIntersection = getNodeIntersection(target, source);

  return {
    sx: sourceIntersection.x,
    sy: sourceIntersection.y,
    tx: targetIntersection.x,
    ty: targetIntersection.y,
  };
}

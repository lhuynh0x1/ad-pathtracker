import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Network } from "lucide-react";
import type { ADNode } from "../../store/useGraphStore";
import type { SubnetData } from "../../types/entities";

export function SubnetNode({ data, selected }: NodeProps<ADNode>) {
  const subnetData = data as SubnetData;
  return (
    <div className="h-full w-full rounded-xl border-2 border-dashed border-gray-600 bg-gray-500/5">
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={160}
        lineStyle={{ borderColor: "#64748b" }}
        handleStyle={{ backgroundColor: "#64748b", width: 8, height: 8 }}
      />
      <div className="flex items-center gap-1.5 rounded-br-lg rounded-tl-lg bg-gray-700/80 px-2 py-1 text-xs font-semibold text-gray-100 w-fit">
        <Network size={13} />
        {subnetData.label}
        {subnetData.cidr && <span className="text-gray-400">({subnetData.cidr})</span>}
      </div>
    </div>
  );
}

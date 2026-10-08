import { Trash2, X } from "lucide-react";
import { useGraphStore } from "../store/useGraphStore";
import { EDGE_KIND_META, type ADEdgeData, type EdgeKind } from "../types/entities";

const inputClass =
  "w-full rounded border border-gray-700 bg-[#1a1e29] px-2 py-1 text-sm text-gray-100 outline-none focus:border-blue-500";

export function EdgeSidebar() {
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const edges = useGraphStore((s) => s.edges);
  const nodes = useGraphStore((s) => s.nodes);
  const updateEdgeData = useGraphStore((s) => s.updateEdgeData);
  const deleteEdge = useGraphStore((s) => s.deleteEdge);
  const selectEdge = useGraphStore((s) => s.selectEdge);

  const edge = edges.find((e) => e.id === selectedEdgeId);
  if (!edge) return null;

  const data = (edge.data ?? { kind: "custom", note: "" }) as ADEdgeData;
  const source = nodes.find((n) => n.id === edge.source)?.data.label ?? "?";
  const target = nodes.find((n) => n.id === edge.target)?.data.label ?? "?";

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-800 bg-[#11141c] p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-200">Relationship</span>
        <button onClick={() => selectEdge(null)} className="text-gray-500 hover:text-gray-200">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs text-gray-400">
          <span className="font-semibold text-gray-200">{source}</span>
          {" → "}
          <span className="font-semibold text-gray-200">{target}</span>
        </p>

        <label className="block text-xs text-gray-400">
          <span className="mb-1 block font-medium text-gray-400">Relationship Type</span>
          <select
            className={inputClass}
            value={data.kind}
            onChange={(e) => updateEdgeData(edge.id, { kind: e.target.value as EdgeKind })}
          >
            {(Object.keys(EDGE_KIND_META) as EdgeKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {EDGE_KIND_META[kind].label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-gray-400">
          <span className="mb-1 block font-medium text-gray-400">Note</span>
          <textarea
            className={inputClass}
            rows={4}
            value={data.note}
            onChange={(e) => updateEdgeData(edge.id, { note: e.target.value })}
            placeholder="e.g. pass-the-hash with svc_backup creds"
          />
        </label>

        <button
          onClick={() => deleteEdge(edge.id)}
          className="mt-2 flex items-center justify-center gap-1 rounded border border-red-900 bg-[#2a1416] px-2 py-1.5 text-xs text-red-300 hover:bg-[#3a1a1d]"
        >
          <Trash2 size={14} /> Delete Relationship
        </button>
      </div>
    </div>
  );
}

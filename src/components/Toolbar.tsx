import { useRef } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { useGraphStore } from "../store/useGraphStore";
import { NODE_LABELS, type ADNodeKind } from "../types/entities";
import { KIND_ICON } from "./nodes/icons";

const ADDABLE_KINDS: ADNodeKind[] = [
  "forest",
  "domain",
  "subnet",
  "domain-controller",
  "computer",
  "user",
  "group",
];

export function Toolbar() {
  const addNode = useGraphStore((s) => s.addNode);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const clearSession = useGraphStore((s) => s.clearSession);
  const importSession = useGraphStore((s) => s.importSession);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = (kind: ADNodeKind) => {
    const col = nodes.length % 5;
    const row = Math.floor(nodes.length / 5);
    addNode(kind, { x: 120 + col * 220, y: 100 + row * 150 });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ad-pathtracker-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        importSession(parsed);
      } catch {
        alert("Invalid session file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClear = () => {
    if (confirm("Clear the entire session? This cannot be undone.")) {
      clearSession();
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-gray-800 bg-[#11141c] px-3 py-2">
      <span className="mr-2 text-sm font-bold tracking-wide text-gray-200">
        AD-PathTracker
      </span>
      <div className="flex items-center gap-1">
        {ADDABLE_KINDS.map((kind) => {
          const Icon = KIND_ICON[kind];
          return (
            <button
              key={kind}
              onClick={() => handleAdd(kind)}
              title={`Add ${NODE_LABELS[kind]}`}
              className="flex items-center gap-1 rounded border border-gray-700 bg-[#1a1e29] px-2 py-1 text-xs text-gray-200 hover:bg-[#232838]"
            >
              <Icon size={14} />
              {NODE_LABELS[kind]}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={handleExport}
          title="Export session"
          className="flex items-center gap-1 rounded border border-gray-700 bg-[#1a1e29] px-2 py-1 text-xs text-gray-200 hover:bg-[#232838]"
        >
          <Download size={14} /> Export
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Import session"
          className="flex items-center gap-1 rounded border border-gray-700 bg-[#1a1e29] px-2 py-1 text-xs text-gray-200 hover:bg-[#232838]"
        >
          <Upload size={14} /> Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleImport}
        />
        <button
          onClick={handleClear}
          title="Clear session"
          className="flex items-center gap-1 rounded border border-red-900 bg-[#2a1416] px-2 py-1 text-xs text-red-300 hover:bg-[#3a1a1d]"
        >
          <Trash2 size={14} /> Clear
        </button>
      </div>
    </div>
  );
}

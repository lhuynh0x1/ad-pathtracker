import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Cable, ShieldAlert, Waypoints } from "lucide-react";
import { KIND_COLOR, KIND_ICON } from "./icons";
import type { ADNode } from "../../store/useGraphStore";
import { isHostData, type AccessLevel } from "../../types/entities";

const ACCESS_BADGE: Record<AccessLevel, { label: string; color: string } | null> = {
  none: null,
  user: { label: "USER", color: "#3b82f6" },
  "local-admin": { label: "LOCAL ADMIN", color: "#f59e0b" },
  "domain-admin": { label: "DOMAIN ADMIN", color: "#ef4444" },
  system: { label: "SYSTEM", color: "#ef4444" },
};

export function ADEntityNode({ data, selected }: NodeProps<ADNode>) {
  const Icon = KIND_ICON[data.kind];
  const color = KIND_COLOR[data.kind];
  const access = "access" in data ? (data.access as AccessLevel) : undefined;
  const privilege = "privilege" in data ? (data.privilege as AccessLevel) : undefined;
  const badge = ACCESS_BADGE[access ?? privilege ?? "none"];

  const host = isHostData(data) ? data : null;
  const ips = (host?.ips ?? []).filter((ip) => ip.trim());
  const multiHomed = ips.length > 1;
  const needsPivot = (host?.services ?? []).some((s) => s.internalOnly);

  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[150px] shadow-lg backdrop-blur-sm"
      style={{
        borderColor: data.compromised ? "#ef4444" : selected ? "#ffffff" : color,
        backgroundColor: "rgba(17, 20, 28, 0.92)",
      }}
    >
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Left} id="left" />
      <div className="flex items-center gap-2">
        <Icon size={18} color={color} strokeWidth={2} />
        <span className="text-sm font-semibold text-gray-100 truncate max-w-[140px]">
          {data.label}
        </span>
        {data.compromised && <ShieldAlert size={14} color="#ef4444" />}
      </div>

      {ips.length > 0 && (
        <div className="mt-0.5 font-mono text-[11px] text-gray-400">{ips.join(", ")}</div>
      )}

      {host && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {badge && (
            <span
              className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
              style={{ backgroundColor: badge.color, color: "#0b0e14" }}
            >
              {badge.label}
            </span>
          )}
          {multiHomed && (
            <span
              title="Multiple IP addresses — multi-homed host"
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-[#0b0e14]"
              style={{ backgroundColor: "#f59e0b" }}
            >
              <Waypoints size={10} /> MULTI-HOMED
            </span>
          )}
          {needsPivot && (
            <span
              title="Internal-only service — needs port forward to reach"
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-[#0b0e14]"
              style={{ backgroundColor: "#ec4899" }}
            >
              <Cable size={10} /> NEEDS PIVOT
            </span>
          )}
        </div>
      )}

      {!host && badge && (
        <div
          className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
          style={{ backgroundColor: badge.color, color: "#0b0e14" }}
        >
          {badge.label}
        </div>
      )}
    </div>
  );
}

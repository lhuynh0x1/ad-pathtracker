import { useState } from "react";
import { Plus, Trash2, Wand2, X } from "lucide-react";
import { useGraphStore } from "../store/useGraphStore";
import { NODE_LABELS, isHostData, type AccessLevel, type ServiceEntry } from "../types/entities";
import { KIND_ICON } from "./nodes/icons";

const ACCESS_LEVELS: AccessLevel[] = ["none", "user", "local-admin", "domain-admin", "system"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-gray-400">
      <span className="mb-1 block font-medium text-gray-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded border border-gray-700 bg-[#1a1e29] px-2 py-1 text-sm text-gray-100 outline-none focus:border-blue-500";
const smallBtn =
  "flex items-center justify-center gap-1 rounded border border-gray-700 bg-[#1a1e29] px-2 py-1 text-xs text-gray-200 hover:bg-[#232838]";

export function Sidebar() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const deleteNode = useGraphStore((s) => s.deleteNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const syncUsersFromHost = useGraphStore((s) => s.syncUsersFromHost);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const data = node.data;
  const Icon = KIND_ICON[data.kind];

  const set = (patch: Record<string, unknown>) => updateNodeData(node.id, patch);

  const host = isHostData(data) ? data : null;

  const updateIp = (idx: number, value: string) => {
    if (!host) return;
    const ips = [...host.ips];
    ips[idx] = value;
    set({ ips });
  };
  const addIp = () => host && set({ ips: [...host.ips, ""] });
  const removeIp = (idx: number) => host && set({ ips: host.ips.filter((_, i) => i !== idx) });

  const updateService = (idx: number, patch: Partial<ServiceEntry>) => {
    if (!host) return;
    const services = host.services.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    set({ services });
  };
  const addService = () =>
    host &&
    set({
      services: [
        ...host.services,
        { id: crypto.randomUUID(), port: "", name: "", internalOnly: false, notes: "" },
      ],
    });
  const removeService = (idx: number) =>
    host && set({ services: host.services.filter((_, i) => i !== idx) });

  const handleSync = () => {
    const result = syncUsersFromHost(node.id);
    setSyncResult(`Created ${result.created} user node(s), updated ${result.updated}.`);
    setTimeout(() => setSyncResult(null), 4000);
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-800 bg-[#11141c] p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} />
          <span className="text-sm font-semibold text-gray-200">
            {NODE_LABELS[data.kind]}
          </span>
        </div>
        <button onClick={() => selectNode(null)} className="text-gray-500 hover:text-gray-200">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto">
        <Field label="Label">
          <input
            className={inputClass}
            value={data.label}
            onChange={(e) => set({ label: e.target.value })}
          />
        </Field>

        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={data.compromised}
            onChange={(e) => set({ compromised: e.target.checked })}
          />
          Compromised / Owned
        </label>

        {data.kind === "forest" && (
          <Field label="Functional Level">
            <input
              className={inputClass}
              value={data.functionalLevel}
              onChange={(e) => set({ functionalLevel: e.target.value })}
            />
          </Field>
        )}

        {data.kind === "domain" && (
          <Field label="FQDN">
            <input
              className={inputClass}
              value={data.fqdn}
              onChange={(e) => set({ fqdn: e.target.value })}
              placeholder="corp.local"
            />
          </Field>
        )}

        {data.kind === "subnet" && (
          <Field label="CIDR">
            <input
              className={inputClass}
              value={data.cidr}
              onChange={(e) => set({ cidr: e.target.value })}
              placeholder="10.10.10.0/24"
            />
          </Field>
        )}

        {host && (
          <>
            <Field label="Hostname">
              <input
                className={inputClass}
                value={host.hostname}
                onChange={(e) => set({ hostname: e.target.value })}
              />
            </Field>

            <div>
              <span className="mb-1 block text-xs font-medium text-gray-400">
                IP Address(es){host.ips.filter((i) => i.trim()).length > 1 && (
                  <span className="ml-1 text-[10px] font-bold text-amber-400">MULTI-HOMED</span>
                )}
              </span>
              <div className="flex flex-col gap-1">
                {host.ips.map((ip, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <input
                      className={inputClass}
                      value={ip}
                      onChange={(e) => updateIp(idx, e.target.value)}
                      placeholder="10.10.10.5"
                    />
                    <button onClick={() => removeIp(idx)} className="text-gray-500 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button onClick={addIp} className={smallBtn}>
                  <Plus size={12} /> Add IP
                </button>
              </div>
            </div>

            <Field label="OS">
              <input
                className={inputClass}
                value={host.os}
                onChange={(e) => set({ os: e.target.value })}
                placeholder="Windows Server 2019"
              />
            </Field>
            <Field label="Access Level">
              <select
                className={inputClass}
                value={host.access}
                onChange={(e) => set({ access: e.target.value as AccessLevel })}
              >
                {ACCESS_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Credentials / Hashes Found">
              <textarea
                className={inputClass}
                rows={2}
                value={host.credsFound}
                onChange={(e) => set({ credsFound: e.target.value })}
              />
            </Field>

            <div>
              <span className="mb-1 block text-xs font-medium text-gray-400">
                Services (flag internal-only ones that need port-forwarding)
              </span>
              <div className="flex flex-col gap-1.5">
                {host.services.map((svc, idx) => (
                  <div key={svc.id} className="rounded border border-gray-700 bg-[#1a1e29] p-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        className={`${inputClass} w-16`}
                        placeholder="Port"
                        value={svc.port}
                        onChange={(e) => updateService(idx, { port: e.target.value })}
                      />
                      <input
                        className={inputClass}
                        placeholder="Service name"
                        value={svc.name}
                        onChange={(e) => updateService(idx, { name: e.target.value })}
                      />
                      <button onClick={() => removeService(idx)} className="text-gray-500 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <label className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
                      <input
                        type="checkbox"
                        checked={svc.internalOnly}
                        onChange={(e) => updateService(idx, { internalOnly: e.target.checked })}
                      />
                      Internal-only — needs port forward to reach
                    </label>
                  </div>
                ))}
                <button onClick={addService} className={smallBtn}>
                  <Plus size={12} /> Add Service
                </button>
              </div>
            </div>

            <Field label="NMAP / Port Scan Output">
              <textarea
                className={`${inputClass} font-mono`}
                rows={4}
                value={host.nmapOutput}
                onChange={(e) => set({ nmapOutput: e.target.value })}
                placeholder="Paste raw nmap output here…"
              />
            </Field>

            <div>
              <span className="mb-1 block text-xs font-medium text-gray-400">
                Discovered Users (one per line, "username" or "username:secret")
              </span>
              <textarea
                className={`${inputClass} font-mono`}
                rows={4}
                value={host.discoveredUsers}
                onChange={(e) => set({ discoveredUsers: e.target.value })}
                placeholder={"jsmith\nadministrator:Summer2024!\nsvc_backup:aad3b435...:31d6cfe0..."}
              />
              <button
                onClick={handleSync}
                className="mt-1.5 flex w-full items-center justify-center gap-1 rounded bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <Wand2 size={13} /> Sync Users From List
              </button>
              {syncResult && <p className="mt-1 text-[11px] text-emerald-400">{syncResult}</p>}
              <p className="mt-1 text-[10px] text-gray-500">
                Creates (or updates) a User node per line and links it to this host automatically —
                no manual node creation needed.
              </p>
            </div>
          </>
        )}

        {data.kind === "user" && (
          <>
            <Field label="Username">
              <input
                className={inputClass}
                value={data.username}
                onChange={(e) => set({ username: e.target.value })}
              />
            </Field>
            <Field label="Domain">
              <input
                className={inputClass}
                value={data.domain}
                onChange={(e) => set({ domain: e.target.value })}
              />
            </Field>
            <Field label="Privilege Level">
              <select
                className={inputClass}
                value={data.privilege}
                onChange={(e) => set({ privilege: e.target.value as AccessLevel })}
              >
                {ACCESS_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Known Credentials (password/hash)">
              <textarea
                className={inputClass}
                rows={2}
                value={data.credsKnown}
                onChange={(e) => set({ credsKnown: e.target.value })}
              />
            </Field>
          </>
        )}

        {data.kind === "group" && (
          <Field label="Domain">
            <input
              className={inputClass}
              value={data.domain}
              onChange={(e) => set({ domain: e.target.value })}
            />
          </Field>
        )}

        <Field label="Notes">
          <textarea
            className={inputClass}
            rows={5}
            value={data.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Enumeration findings, attack ideas, etc."
          />
        </Field>

        <button
          onClick={() => deleteNode(node.id)}
          className="mt-2 flex items-center justify-center gap-1 rounded border border-red-900 bg-[#2a1416] px-2 py-1.5 text-xs text-red-300 hover:bg-[#3a1a1d]"
        >
          <Trash2 size={14} /> Delete Node
        </button>
      </div>
    </div>
  );
}

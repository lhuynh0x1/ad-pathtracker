import {
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { v4 as uuid } from "uuid";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  EDGE_KIND_META,
  NODE_DEFAULTS,
  isHostData,
  type ADEdgeData,
  type ADNodeData,
  type ADNodeKind,
  type EdgeKind,
  type SubnetData,
  type UserData,
} from "../types/entities";

export type ADNode = Node<ADNodeData>;
export type ADEdge = Edge<ADEdgeData>;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function edgeStyleFor(kind: EdgeKind) {
  const meta = EDGE_KIND_META[kind];
  return {
    stroke: meta.color,
    strokeWidth: 2,
    strokeDasharray: meta.dashed ? "6 4" : undefined,
  };
}

// /24 network for an IPv4 address, e.g. "10.10.10.5" -> "10.10.10.0/24".
function networkOf(ip: string): string | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

const SUBNET_COLS = 2;
const SUBNET_COL_WIDTH = 220;
const SUBNET_ROW_HEIGHT = 100;

interface GraphState {
  nodes: ADNode[];
  edges: ADEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  chatMessages: ChatMessage[];

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  addNode: (kind: ADNodeKind, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, data: Partial<ADNodeData>) => void;
  deleteNode: (id: string) => void;
  selectNode: (id: string | null) => void;

  updateEdgeData: (id: string, data: Partial<ADEdgeData>) => void;
  deleteEdge: (id: string) => void;
  selectEdge: (id: string | null) => void;

  syncUsersFromHost: (hostId: string) => { created: number; updated: number };
  syncSubnetGrouping: () => void;

  addChatMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  clearChat: () => void;

  clearSession: () => void;
  importSession: (data: { nodes: ADNode[]; edges: ADEdge[] }) => void;
}

export const useGraphStore = create<GraphState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      chatMessages: [],

      onNodesChange: (changes) => {
        set({ nodes: applyNodeChanges(changes, get().nodes) as ADNode[] });
      },
      onEdgesChange: (changes) => {
        set({ edges: applyEdgeChanges(changes, get().edges) as ADEdge[] });
      },
      onConnect: (connection) => {
        if (!connection.source || !connection.target) return;
        const kind: EdgeKind = "lateral-movement";
        const edge: ADEdge = {
          id: uuid(),
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          label: EDGE_KIND_META[kind].label,
          type: "adedge",
          markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_KIND_META[kind].color },
          style: edgeStyleFor(kind),
          data: { kind, note: "" },
        };
        set({ edges: [...get().edges, edge] });
      },

      addNode: (kind, position) => {
        const data = NODE_DEFAULTS[kind]();
        const isSubnet = kind === "subnet";
        const node: ADNode = {
          id: uuid(),
          type: kind,
          position,
          data,
          ...(isSubnet
            ? { style: { width: 480, height: 320 }, zIndex: -1000 }
            : {}),
        };
        set({ nodes: [...get().nodes, node] });
      },

      updateNodeData: (id, data) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...data } as ADNodeData } : n
          ),
        });
        if ("ips" in data) get().syncSubnetGrouping();
      },

      syncSubnetGrouping: () => {
        let working = [...get().nodes];
        let changed = false;

        const findSubnetByCidr = (cidr: string) =>
          working.find((n) => n.type === "subnet" && (n.data as SubnetData).cidr === cidr);

        const parentCidrOf = (node: ADNode) => {
          if (!node.parentId) return null;
          const parent = working.find((n) => n.id === node.parentId);
          return parent && parent.type === "subnet" ? (parent.data as SubnetData).cidr : null;
        };

        const ensureSubnet = (cidr: string) => {
          let subnet = findSubnetByCidr(cidr);
          if (!subnet) {
            const subnetCount = working.filter((n) => n.type === "subnet").length;
            subnet = {
              id: uuid(),
              type: "subnet",
              position: { x: 650 + subnetCount * 40, y: 60 + subnetCount * 260 },
              style: { width: 500, height: 190 },
              zIndex: -1000,
              data: { kind: "subnet", label: cidr, notes: "", compromised: false, cidr },
            };
            working = [...working, subnet];
            return { subnet, created: true };
          }
          return { subnet, created: false };
        };

        working
          .filter((n) => isHostData(n.data))
          .forEach((host) => {
            const ips = (host.data as { ips: string[] }).ips.filter((ip) => ip.trim());
            const distinctCidrs = Array.from(
              new Set(ips.map(networkOf).filter((c): c is string => Boolean(c)))
            );
            const liveHost = working.find((n) => n.id === host.id)!;

            // --- No IP, or every IP in the same network: single-parent containment ---
            if (distinctCidrs.length <= 1) {
              const desiredCidr = distinctCidrs[0] ?? null;
              const existingCidr = parentCidrOf(liveHost);
              if (desiredCidr === existingCidr) return; // already correctly grouped (or ungrouped)

              changed = true;

              if (!desiredCidr) {
                // No valid IP anymore — leave it wherever it visually is, just detach it.
                const absPos = liveHost.parentId
                  ? (() => {
                      const p = working.find((n) => n.id === liveHost.parentId);
                      return p
                        ? { x: p.position.x + liveHost.position.x, y: p.position.y + liveHost.position.y }
                        : liveHost.position;
                    })()
                  : liveHost.position;
                working = working.map((n) =>
                  n.id === liveHost.id ? { ...n, parentId: undefined, extent: undefined, position: absPos } : n
                );
                return;
              }

              const { subnet } = ensureSubnet(desiredCidr);
              const subnetId = subnet.id;

              const siblingCount = working.filter((n) => n.parentId === subnetId).length;
              const col = siblingCount % SUBNET_COLS;
              const row = Math.floor(siblingCount / SUBNET_COLS);

              working = working.map((n) =>
                n.id === liveHost.id
                  ? {
                      ...n,
                      parentId: subnetId,
                      extent: "parent" as const,
                      position: { x: 30 + col * SUBNET_COL_WIDTH, y: 60 + row * SUBNET_ROW_HEIGHT },
                    }
                  : n
              );

              const requiredHeight = 90 + Math.ceil((siblingCount + 1) / SUBNET_COLS) * SUBNET_ROW_HEIGHT;
              working = working.map((n) => {
                if (n.id !== subnetId) return n;
                const currentStyle = (n.style ?? {}) as { width?: number; height?: number };
                return {
                  ...n,
                  style: {
                    width: Math.max(currentStyle.width ?? 0, 500),
                    height: Math.max(currentStyle.height ?? 0, requiredHeight),
                  },
                };
              });
              return;
            }

            // --- IPs span multiple networks: this host is a pivot/bridge, not a
            // resident of any single subnet. Make sure every network it touches
            // has a subnet box, and float it outside all of them (reposition only
            // the first time it becomes a bridge, or when a newly-added IP opens
            // up a network that doesn't have a box yet — not on every unrelated
            // edit, so manual dragging afterwards sticks).
            const wasContained = Boolean(liveHost.parentId);
            let createdAny = false;
            const involvedSubnets = distinctCidrs.map((cidr) => {
              const { subnet, created } = ensureSubnet(cidr);
              if (created) createdAny = true;
              return subnet;
            });

            if (!wasContained && !createdAny) return; // already bridging correctly, leave it alone

            changed = true;
            const hostWidth = 190;
            const hostHeight = 80;
            const cx =
              involvedSubnets.reduce((sum, s) => {
                const w = (s.style as { width?: number } | undefined)?.width ?? 500;
                return sum + s.position.x + w / 2;
              }, 0) / involvedSubnets.length;
            const cy =
              involvedSubnets.reduce((sum, s) => {
                const h = (s.style as { height?: number } | undefined)?.height ?? 190;
                return sum + s.position.y + h / 2;
              }, 0) / involvedSubnets.length;

            working = working.map((n) =>
              n.id === liveHost.id
                ? {
                    ...n,
                    parentId: undefined,
                    extent: undefined,
                    position: { x: cx - hostWidth / 2, y: cy - hostHeight / 2 },
                  }
                : n
            );
          });

        if (changed) set({ nodes: working });
      },

      deleteNode: (id) => {
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
        });
      },

      selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),

      updateEdgeData: (id, data) => {
        set({
          edges: get().edges.map((e) => {
            if (e.id !== id) return e;
            const nextData = { ...(e.data as ADEdgeData), ...data } as ADEdgeData;
            const meta = EDGE_KIND_META[nextData.kind];
            return {
              ...e,
              data: nextData,
              label: meta.label,
              markerEnd: { type: MarkerType.ArrowClosed, color: meta.color },
              style: edgeStyleFor(nextData.kind),
            };
          }),
        });
      },

      deleteEdge: (id) => {
        set({
          edges: get().edges.filter((e) => e.id !== id),
          selectedEdgeId: get().selectedEdgeId === id ? null : get().selectedEdgeId,
        });
      },

      selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

      syncUsersFromHost: (hostId) => {
        const host = get().nodes.find((n) => n.id === hostId);
        if (!host || !isHostData(host.data)) return { created: 0, updated: 0 };

        const lines = host.data.discoveredUsers
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        let created = 0;
        let updated = 0;
        const nextNodes = [...get().nodes];
        const nextEdges = [...get().edges];
        const domainGuess =
          "domain" in host.data ? (host.data.domain as string) : host.data.hostname || "";

        lines.forEach((line, idx) => {
          const [rawUser, secret] = line.split(":").map((s) => s?.trim());
          if (!rawUser) return;

          const existingIdx = nextNodes.findIndex(
            (n) => n.data.kind === "user" && (n.data as UserData).username.toLowerCase() === rawUser.toLowerCase()
          );

          if (existingIdx >= 0) {
            const existing = nextNodes[existingIdx];
            const existingData = existing.data as UserData;
            nextNodes[existingIdx] = {
              ...existing,
              data: {
                ...existingData,
                credsKnown: secret
                  ? [existingData.credsKnown, secret].filter(Boolean).join("\n")
                  : existingData.credsKnown,
                compromised: existingData.compromised || Boolean(secret),
              },
            };
            updated++;

            const edgeExists = nextEdges.some(
              (e) => e.source === hostId && e.target === existing.id
            );
            if (!edgeExists) {
              nextEdges.push(makeDiscoveredEdge(hostId, existing.id));
            }
          } else {
            const newUser: ADNode = {
              id: uuid(),
              type: "user",
              position: {
                x: host.position.x + 260,
                y: host.position.y + idx * 90,
              },
              data: {
                kind: "user",
                label: rawUser,
                notes: "",
                compromised: Boolean(secret),
                username: rawUser,
                domain: domainGuess,
                privilege: "none",
                credsKnown: secret ?? "",
                sourceHostId: hostId,
              },
            };
            nextNodes.push(newUser);
            nextEdges.push(makeDiscoveredEdge(hostId, newUser.id));
            created++;
          }
        });

        set({ nodes: nextNodes, edges: nextEdges });
        return { created, updated };
      },

      addChatMessage: (message) => {
        set({
          chatMessages: [
            ...get().chatMessages,
            { ...message, id: uuid(), timestamp: Date.now() },
          ],
        });
      },
      clearChat: () => set({ chatMessages: [] }),

      clearSession: () =>
        set({ nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null, chatMessages: [] }),
      importSession: (data) =>
        set({ nodes: data.nodes, edges: data.edges, selectedNodeId: null, selectedEdgeId: null }),
    }),
    {
      name: "ad-pathtracker-session",
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) {
          // Node data shape changed (single `ip` -> `ips[]`, added services/nmap/discoveredUsers).
          // Old sessions can't be safely upgraded automatically, so start fresh rather than crash.
          return { nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null, chatMessages: [] };
        }
        return persisted as GraphState;
      },
    }
  )
);

function makeDiscoveredEdge(sourceId: string, targetId: string): ADEdge {
  const kind: EdgeKind = "discovered-on";
  return {
    id: uuid(),
    source: sourceId,
    target: targetId,
    label: EDGE_KIND_META[kind].label,
    type: "adedge",
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_KIND_META[kind].color },
    style: edgeStyleFor(kind),
    data: { kind, note: "" },
  };
}

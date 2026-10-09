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

function absolutePositionOf(node: ADNode, allNodes: ADNode[]): { x: number; y: number } {
  if (!node.parentId) return node.position;
  const parent = allNodes.find((n) => n.id === node.parentId);
  if (!parent) return node.position;
  const parentAbs = absolutePositionOf(parent, allNodes);
  return { x: parentAbs.x + node.position.x, y: parentAbs.y + node.position.y };
}

// Layout constants for auto-sizing containers (hosts holding discovered
// users, subnets holding hosts) so nothing needs manual resizing.
const HOST_HEADER_HEIGHT = 110; // room for label/ip/badge rows before the user list starts
const HOST_ROW_HEIGHT = 86; // height reserved per attached user node
const HOST_CONTAINER_WIDTH = 260;
const HOST_BOTTOM_PAD = 16;
const HOST_DEFAULT_HEIGHT = 80; // fallback used when stacking a childless host in a subnet

const SUBNET_WIDTH = 340;
const SUBNET_EMPTY_HEIGHT = 160;
const SUBNET_PAD_TOP = 60; // below the corner label
const SUBNET_PAD_X = 30;
const SUBNET_GAP = 20;

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
  syncHostContainerSizing: () => void;
  syncSubnetGrouping: () => void;
  recomputeLayout: () => void;

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
            ? { style: { width: SUBNET_WIDTH, height: SUBNET_EMPTY_HEIGHT }, zIndex: -1000 }
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
        if ("ips" in data) get().recomputeLayout();
      },

      recomputeLayout: () => {
        get().syncHostContainerSizing();
        get().syncSubnetGrouping();
      },

      // Auto-size each host card to fit however many user nodes are nested
      // inside it (discovered-on-this-host users), stacking them in a
      // single column and shrinking back to a compact card when empty.
      syncHostContainerSizing: () => {
        let working = [...get().nodes];
        let changed = false;

        working
          .filter((n) => isHostData(n.data))
          .forEach((host) => {
            const liveHost = working.find((n) => n.id === host.id)!;
            const children = working.filter((n) => n.parentId === host.id && n.data.kind === "user");

            if (children.length === 0) {
              if (liveHost.style) {
                changed = true;
                working = working.map((n) => (n.id === host.id ? { ...n, style: undefined } : n));
              }
              return;
            }

            const height = HOST_HEADER_HEIGHT + children.length * HOST_ROW_HEIGHT + HOST_BOTTOM_PAD;
            const currentStyle = (liveHost.style ?? {}) as { width?: number; height?: number };
            if (currentStyle.width !== HOST_CONTAINER_WIDTH || currentStyle.height !== height) {
              changed = true;
              working = working.map((n) =>
                n.id === host.id ? { ...n, style: { width: HOST_CONTAINER_WIDTH, height } } : n
              );
            }

            children.forEach((child, idx) => {
              const desired = { x: 20, y: HOST_HEADER_HEIGHT + idx * HOST_ROW_HEIGHT };
              const liveChild = working.find((n) => n.id === child.id)!;
              if (liveChild.position.x !== desired.x || liveChild.position.y !== desired.y) {
                changed = true;
                working = working.map((n) => (n.id === child.id ? { ...n, position: desired } : n));
              }
            });
          });

        if (changed) set({ nodes: working });
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
              position: { x: 650 + subnetCount * 40, y: 60 + subnetCount * 320 },
              style: { width: SUBNET_WIDTH, height: SUBNET_EMPTY_HEIGHT },
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
                const absPos = absolutePositionOf(liveHost, working);
                working = working.map((n) =>
                  n.id === liveHost.id ? { ...n, parentId: undefined, extent: undefined, position: absPos } : n
                );
                return;
              }

              const { subnet } = ensureSubnet(desiredCidr);
              working = working.map((n) =>
                n.id === liveHost.id
                  ? {
                      ...n,
                      parentId: subnet.id,
                      extent: "parent" as const,
                      position: { x: SUBNET_PAD_X, y: SUBNET_PAD_TOP },
                    }
                  : n
              );
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
                const w = (s.style as { width?: number } | undefined)?.width ?? SUBNET_WIDTH;
                return sum + s.position.x + w / 2;
              }, 0) / involvedSubnets.length;
            const cy =
              involvedSubnets.reduce((sum, s) => {
                const h = (s.style as { height?: number } | undefined)?.height ?? SUBNET_EMPTY_HEIGHT;
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

        // Final pass: stack every subnet's contained hosts vertically using
        // each host's *actual current* height (so a host that's grown tall
        // from attached users doesn't overlap its neighbors), and size the
        // subnet to fit exactly — shrinking as well as growing.
        working
          .filter((n) => n.type === "subnet")
          .forEach((subnet) => {
            const children = working.filter((n) => n.parentId === subnet.id);
            let y = SUBNET_PAD_TOP;
            children.forEach((child) => {
              const pos = { x: SUBNET_PAD_X, y };
              const live = working.find((n) => n.id === child.id)!;
              if (live.position.x !== pos.x || live.position.y !== pos.y) {
                changed = true;
                working = working.map((n) => (n.id === child.id ? { ...n, position: pos } : n));
              }
              const h = (live.style as { height?: number } | undefined)?.height ?? HOST_DEFAULT_HEIGHT;
              y += h + SUBNET_GAP;
            });

            const requiredHeight = children.length === 0 ? SUBNET_EMPTY_HEIGHT : y + 10;
            const liveSubnet = working.find((n) => n.id === subnet.id)!;
            const currentStyle = (liveSubnet.style ?? {}) as { width?: number; height?: number };
            if (currentStyle.width !== SUBNET_WIDTH || currentStyle.height !== requiredHeight) {
              changed = true;
              working = working.map((n) =>
                n.id === subnet.id ? { ...n, style: { width: SUBNET_WIDTH, height: requiredHeight } } : n
              );
            }
          });

        if (changed) set({ nodes: working });
      },

      deleteNode: (id) => {
        const nodes = get().nodes;
        const deletedNode = nodes.find((n) => n.id === id);
        let nextNodes = nodes.filter((n) => n.id !== id);

        if (deletedNode) {
          const deletedAbsPos = absolutePositionOf(deletedNode, nodes);
          nextNodes = nextNodes.map((n) =>
            n.parentId === id
              ? {
                  ...n,
                  parentId: undefined,
                  extent: undefined,
                  position: { x: deletedAbsPos.x + n.position.x, y: deletedAbsPos.y + n.position.y },
                }
              : n
          );
        }

        set({
          nodes: nextNodes,
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
        });

        get().recomputeLayout();
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

        lines.forEach((line) => {
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

            // Already nested in (or standalone/elsewhere from) a different
            // context — don't relocate it, just note it was also seen here.
            if (existing.parentId !== hostId) {
              const edgeExists = nextEdges.some((e) => e.source === hostId && e.target === existing.id);
              if (!edgeExists) nextEdges.push(makeDiscoveredEdge(hostId, existing.id));
            }
          } else {
            // Brand new — nest it directly inside the host card instead of
            // floating it off to the side with an arrow. syncHostContainerSizing
            // (called below) fixes up its exact position/size immediately after.
            const newUser: ADNode = {
              id: uuid(),
              type: "user",
              parentId: hostId,
              extent: "parent",
              position: { x: 20, y: 0 },
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
            created++;
          }
        });

        set({ nodes: nextNodes, edges: nextEdges });
        get().recomputeLayout();
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

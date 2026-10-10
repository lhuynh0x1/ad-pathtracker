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
const SUBNET_GAP = 20; // between stacked hosts inside a subnet, and between stacked subnets
const SUBNET_X = 650; // all subnets stack in a single column at this x
const BRIDGE_GAP = 80; // clearance to the right of the subnet column for pivot/bridge hosts

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
  attachUserToHost: (userId: string, hostId: string) => void;
  detachUserFromHost: (userId: string) => void;

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
          const existing = findSubnetByCidr(cidr);
          if (existing) return existing;
          const subnet: ADNode = {
            id: uuid(),
            type: "subnet",
            position: { x: SUBNET_X, y: 0 }, // y finalized in the stacking pass below
            style: { width: SUBNET_WIDTH, height: SUBNET_EMPTY_HEIGHT },
            zIndex: -1000,
            data: { kind: "subnet", label: cidr, notes: "", compromised: false, cidr },
          };
          working = [...working, subnet];
          changed = true;
          return subnet;
        };

        // --- Phase 1: decide membership — which single subnet a host belongs
        // to, or which subnets a multi-homed host bridges (without finalizing
        // bridge position yet, since that depends on the final subnet stack).
        const bridgeHostIds: { hostId: string; cidrs: string[] }[] = [];

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

              const subnet = ensureSubnet(desiredCidr);
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

            // --- IPs span multiple networks: this host is a pivot/bridge, not
            // a resident of any single subnet (dropping it inside one would
            // misrepresent it, and its box could later grow and spill out of
            // that subnet's boundary). Make sure every network it touches has
            // a subnet box, and remember it for bridge positioning in Phase 3.
            distinctCidrs.forEach(ensureSubnet);
            if (liveHost.parentId) {
              changed = true;
              const absPos = absolutePositionOf(liveHost, working);
              working = working.map((n) =>
                n.id === liveHost.id ? { ...n, parentId: undefined, extent: undefined, position: absPos } : n
              );
            }
            bridgeHostIds.push({ hostId: host.id, cidrs: distinctCidrs });
          });

        // --- Phase 2: stack every subnet vertically in a single column,
        // using each one's *actual current* content height (so a host that's
        // grown tall from attached users doesn't overlap its neighbors), and
        // size each subnet to fit exactly — shrinking as well as growing.
        // Subnets are repositioned based on the *previous* subnet's real
        // bottom edge (not a fixed offset), so subnets never overlap each
        // other either, however tall their contents get.
        let cursorY = 60;
        working
          .filter((n) => n.type === "subnet")
          .map((n) => n.id)
          .forEach((subnetId) => {
            const children = working.filter((n) => n.parentId === subnetId);
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
            const liveSubnet = working.find((n) => n.id === subnetId)!;
            const currentStyle = (liveSubnet.style ?? {}) as { width?: number; height?: number };
            const desiredPos = { x: SUBNET_X, y: cursorY };
            if (
              currentStyle.width !== SUBNET_WIDTH ||
              currentStyle.height !== requiredHeight ||
              liveSubnet.position.x !== desiredPos.x ||
              liveSubnet.position.y !== desiredPos.y
            ) {
              changed = true;
              working = working.map((n) =>
                n.id === subnetId
                  ? { ...n, position: desiredPos, style: { width: SUBNET_WIDTH, height: requiredHeight } }
                  : n
              );
            }
            cursorY += requiredHeight + SUBNET_GAP;
          });

        // --- Phase 3: position every bridge host clear of the *entire*
        // subnet column (to its right), vertically centered between the
        // subnets it bridges — this can never overlap a subnet box
        // regardless of how tall anything grows, unlike squeezing it into a
        // gap between two subnets whose heights change independently.
        const rightEdge =
          working
            .filter((n) => n.type === "subnet")
            .reduce(
              (max, s) => Math.max(max, s.position.x + ((s.style as { width?: number })?.width ?? SUBNET_WIDTH)),
              0
            ) + BRIDGE_GAP;

        bridgeHostIds.forEach(({ hostId, cidrs }) => {
          const involved = cidrs.map(findSubnetByCidr).filter((s): s is ADNode => Boolean(s));
          if (involved.length === 0) return;
          const avgY =
            involved.reduce((sum, s) => {
              const h = (s.style as { height?: number } | undefined)?.height ?? SUBNET_EMPTY_HEIGHT;
              return sum + s.position.y + h / 2;
            }, 0) / involved.length;

          const hostHeight = 80;
          const desired = { x: rightEdge, y: avgY - hostHeight / 2 };
          const liveHost = working.find((n) => n.id === hostId)!;
          if (liveHost.position.x !== desired.x || liveHost.position.y !== desired.y) {
            changed = true;
            working = working.map((n) => (n.id === hostId ? { ...n, position: desired } : n));
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

      // Drag-and-drop a User node onto a Computer/DC node to mark "this user
      // was seen on this device" — called from Canvas's onNodeDragStop once
      // it detects the drop landed on a host.
      attachUserToHost: (userId, hostId) => {
        const nodes = get().nodes;
        const user = nodes.find((n) => n.id === userId);
        const host = nodes.find((n) => n.id === hostId);
        if (!user || user.data.kind !== "user" || !host || !isHostData(host.data)) return;
        if (user.parentId === hostId) {
          get().recomputeLayout(); // still snap it back into the clean stack slot
          return;
        }

        set({
          nodes: nodes.map((n) => (n.id === userId ? { ...n, parentId: hostId, position: { x: 20, y: 0 } } : n)),
        });
        get().recomputeLayout();
      },

      detachUserFromHost: (userId) => {
        const nodes = get().nodes;
        const user = nodes.find((n) => n.id === userId);
        if (!user || !user.parentId) return;
        const absPos = absolutePositionOf(user, nodes);
        set({
          nodes: nodes.map((n) => (n.id === userId ? { ...n, parentId: undefined, position: absPos } : n)),
        });
        get().recomputeLayout();
      },

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
              // No `extent: 'parent'` — kept free-draggable so it can be
              // manually dragged back out; onNodeDragStop decides whether a
              // drop keeps it attached based on where it actually lands.
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
      version: 3,
      // Earlier versions wiped the whole session on any version bump. That's
      // overkill for the common case (a new optional field added to a node's
      // data) and does nothing for the case it doesn't catch (a field added
      // without remembering to bump `version`, which used to crash instead).
      // `merge` runs on *every* load regardless of version, and repairs each
      // node/edge by filling in anything missing from its kind's current
      // defaults — so a saved session survives routine schema growth and a
      // refresh just works. A field *rename* (not just an addition) would
      // still need a one-off conversion added here when that happens.
      migrate: (persisted) => persisted as GraphState,
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<GraphState>;

        const nodes: ADNode[] = Array.isArray(persisted.nodes)
          ? persisted.nodes
              .filter(
                (n): n is ADNode =>
                  Boolean(n) &&
                  typeof n === "object" &&
                  typeof n.id === "string" &&
                  Boolean(n.data) &&
                  n.data.kind in NODE_DEFAULTS
              )
              .map((n) => ({ ...n, data: { ...NODE_DEFAULTS[n.data.kind](), ...n.data } }))
          : currentState.nodes;

        const edges: ADEdge[] = Array.isArray(persisted.edges)
          ? persisted.edges
              .filter(
                (e): e is ADEdge =>
                  Boolean(e) && typeof e === "object" && typeof e.id === "string" && Boolean(e.source) && Boolean(e.target)
              )
              .map((e) => ({
                ...e,
                type: "adedge",
                data: e.data && (e.data as ADEdgeData).kind ? e.data : ({ kind: "custom", note: "" } as ADEdgeData),
              }))
          : currentState.edges;

        return {
          ...currentState,
          nodes,
          edges,
          chatMessages: Array.isArray(persisted.chatMessages) ? persisted.chatMessages : currentState.chatMessages,
        };
      },
      onRehydrateStorage: () => () => {
        // `merge` repairs data shape on load, but the *positions/sizes* baked
        // into a saved session reflect whatever the layout engine computed
        // the last time something changed — not necessarily today's layout
        // rules. Re-running it once after load snaps an older session to the
        // current rules (e.g. a bridging host that used to overlap a subnet
        // before that was fixed) without waiting for an unrelated edit to
        // trigger it. Deferred because the store reference isn't assigned yet
        // at the point zustand invokes this.
        queueMicrotask(() => useGraphStore.getState().recomputeLayout());
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

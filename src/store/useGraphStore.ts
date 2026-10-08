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

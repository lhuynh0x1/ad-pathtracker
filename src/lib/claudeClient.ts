import type { Edge } from "@xyflow/react";
import type { ADNode } from "../store/useGraphStore";

const API_KEY_STORAGE_KEY = "ad-pathtracker-claude-api-key";
const MODEL_STORAGE_KEY = "ad-pathtracker-claude-model";

export const CLAUDE_MODELS = [
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude-opus-5", label: "Claude Opus 5" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
}

export function setApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function getModel(): string {
  return localStorage.getItem(MODEL_STORAGE_KEY) ?? CLAUDE_MODELS[0].id;
}

export function setModel(model: string) {
  localStorage.setItem(MODEL_STORAGE_KEY, model);
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (typeof value[0] === "object") {
      return value
        .map((v) => Object.entries(v as Record<string, unknown>)
          .filter(([k, val]) => k !== "id" && val !== "" && val !== false)
          .map(([k, val]) => `${k}=${val}`)
          .join(" "))
        .filter(Boolean)
        .join("; ");
    }
    return value.filter(Boolean).join(", ");
  }
  return String(value);
}

function describeNode(node: ADNode): string {
  const d = node.data as Record<string, unknown>;
  const fields = Object.entries(d)
    .filter(([key]) => !["kind", "label"].includes(key))
    .map(([key, value]) => [key, formatValue(value)] as const)
    .filter(([, value]) => value !== "" && value !== "false")
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  return `- [${d.kind}] "${d.label}" (id: ${node.id})${fields ? ` — ${fields}` : ""}`;
}

export function buildSessionContext(nodes: ADNode[], edges: Edge[]): string {
  const nodeLines = nodes.map(describeNode).join("\n") || "(no entities added yet)";
  const edgeLines =
    edges
      .map((e) => {
        const from = nodes.find((n) => n.id === e.source)?.data.label ?? e.source;
        const to = nodes.find((n) => n.id === e.target)?.data.label ?? e.target;
        const edgeData = e.data as { kind?: string; note?: string } | undefined;
        const kind = edgeData?.kind ?? e.label ?? "related-to";
        const note = edgeData?.note ? ` note: ${edgeData.note}` : "";
        return `- ${from} -> ${to} (${kind})${note}`;
      })
      .join("\n") || "(no relationships drawn yet)";

  return `Current Active Directory engagement map:\n\nENTITIES:\n${nodeLines}\n\nRELATIONSHIPS:\n${edgeLines}`;
}

const SYSTEM_PROMPT = `You are an offensive security assistant embedded in AD-PathTracker, a tool used during authorized engagements (HackTheBox, CTFs, exam environments like OSCP/CPTS, or authorized pentests) to track Active Directory enumeration findings.

You will be given the current state of the user's engagement map (hosts, users, groups, domains, subnets, access levels, credentials found, and relationships between them) plus their question. Your job is to suggest the next best attack vector(s) based strictly on what has been manually recorded, calling out concrete techniques (e.g. Kerberoasting, ACL abuse, unconstrained delegation, lateral movement via known creds) and referencing specific entities by name. If information is missing that would change your answer, say what to enumerate next. Keep responses focused and actionable.`;

export async function askClaude(params: {
  userMessage: string;
  history: { role: "user" | "assistant"; content: string }[];
  nodes: ADNode[];
  edges: Edge[];
}): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "No Claude API key configured. Open the chat settings (gear icon) and add your Anthropic API key."
    );
  }

  const context = buildSessionContext(params.nodes, params.edges);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: getModel(),
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        ...params.history,
        { role: "user", content: `${context}\n\nQuestion: ${params.userMessage}` },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errBody}`);
  }

  const json = await response.json();
  return json.content?.[0]?.text ?? "(empty response)";
}

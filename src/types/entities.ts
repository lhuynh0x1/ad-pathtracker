export type ADNodeKind =
  | "forest"
  | "domain"
  | "subnet"
  | "computer"
  | "domain-controller"
  | "user"
  | "group";

export type AccessLevel = "none" | "user" | "local-admin" | "domain-admin" | "system";

export interface ServiceEntry {
  id: string;
  port: string;
  name: string;
  internalOnly: boolean;
  notes: string;
}

export interface BaseEntityData {
  kind: ADNodeKind;
  label: string;
  notes: string;
  compromised: boolean;
  [key: string]: unknown;
}

export interface ForestData extends BaseEntityData {
  kind: "forest";
  functionalLevel: string;
}

export interface DomainData extends BaseEntityData {
  kind: "domain";
  fqdn: string;
}

export interface SubnetData extends BaseEntityData {
  kind: "subnet";
  cidr: string;
}

export interface HostData extends BaseEntityData {
  kind: "computer" | "domain-controller";
  hostname: string;
  ips: string[];
  os: string;
  access: AccessLevel;
  credsFound: string;
  services: ServiceEntry[];
  nmapOutput: string;
  discoveredUsers: string;
}

export interface ComputerData extends HostData {
  kind: "computer";
}

export interface DomainControllerData extends HostData {
  kind: "domain-controller";
}

export interface UserData extends BaseEntityData {
  kind: "user";
  username: string;
  domain: string;
  privilege: AccessLevel;
  credsKnown: string;
  sourceHostId?: string;
}

export interface GroupData extends BaseEntityData {
  kind: "group";
  domain: string;
}

export type ADNodeData =
  | ForestData
  | DomainData
  | SubnetData
  | ComputerData
  | DomainControllerData
  | UserData
  | GroupData;

export const NODE_DEFAULTS: Record<ADNodeKind, () => ADNodeData> = {
  forest: () => ({
    kind: "forest",
    label: "New Forest",
    notes: "",
    compromised: false,
    functionalLevel: "",
  }),
  domain: () => ({
    kind: "domain",
    label: "New Domain",
    notes: "",
    compromised: false,
    fqdn: "",
  }),
  subnet: () => ({
    kind: "subnet",
    label: "New Subnet",
    notes: "",
    compromised: false,
    cidr: "",
  }),
  computer: () => ({
    kind: "computer",
    label: "New Computer",
    notes: "",
    compromised: false,
    hostname: "",
    ips: [""],
    os: "",
    access: "none",
    credsFound: "",
    services: [],
    nmapOutput: "",
    discoveredUsers: "",
  }),
  "domain-controller": () => ({
    kind: "domain-controller",
    label: "New DC",
    notes: "",
    compromised: false,
    hostname: "",
    ips: [""],
    os: "",
    access: "none",
    credsFound: "",
    services: [],
    nmapOutput: "",
    discoveredUsers: "",
  }),
  user: () => ({
    kind: "user",
    label: "New User",
    notes: "",
    compromised: false,
    username: "",
    domain: "",
    privilege: "none",
    credsKnown: "",
  }),
  group: () => ({
    kind: "group",
    label: "New Group",
    notes: "",
    compromised: false,
    domain: "",
  }),
};

export const NODE_LABELS: Record<ADNodeKind, string> = {
  forest: "Forest",
  domain: "Domain",
  subnet: "Subnet",
  computer: "Computer",
  "domain-controller": "Domain Controller",
  user: "User",
  group: "Group",
};

export function isHostData(data: ADNodeData): data is ComputerData | DomainControllerData {
  return data.kind === "computer" || data.kind === "domain-controller";
}

export type EdgeKind =
  | "lateral-movement"
  | "admin-to"
  | "has-session"
  | "member-of"
  | "trusts"
  | "discovered-on"
  | "custom";

export const EDGE_KIND_META: Record<EdgeKind, { label: string; color: string; dashed?: boolean }> = {
  "lateral-movement": { label: "Lateral Movement", color: "#ef4444" },
  "admin-to": { label: "Admin To", color: "#f59e0b" },
  "has-session": { label: "Has Session", color: "#3b82f6" },
  "member-of": { label: "Member Of", color: "#8b5cf6", dashed: true },
  trusts: { label: "Trusts", color: "#06b6d4", dashed: true },
  "discovered-on": { label: "Discovered On", color: "#64748b", dashed: true },
  custom: { label: "Custom", color: "#94a3b8" },
};

export interface ADEdgeData {
  kind: EdgeKind;
  note: string;
  [key: string]: unknown;
}

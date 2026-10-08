import {
  Globe,
  Network,
  Monitor,
  ServerCog,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ADNodeKind } from "../../types/entities";

export const KIND_ICON: Record<ADNodeKind, LucideIcon> = {
  forest: Globe,
  domain: Network,
  subnet: Network,
  computer: Monitor,
  "domain-controller": ServerCog,
  user: User,
  group: Users,
};

export const KIND_COLOR: Record<ADNodeKind, string> = {
  forest: "#8b5cf6",
  domain: "#3b82f6",
  subnet: "#64748b",
  computer: "#22c55e",
  "domain-controller": "#f59e0b",
  user: "#06b6d4",
  group: "#ec4899",
};

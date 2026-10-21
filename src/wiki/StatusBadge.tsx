import type { PageStatus } from "../../shared/schema.ts";
import { Badge, type BadgeTone } from "../ui/index.ts";

const TONE: Record<PageStatus, BadgeTone> = {
  idea: "neutral",
  planned: "neutral",
  active: "accent",
  paused: "warn",
  done: "good",
  archived: "neutral",
};

/** A page's `status` from its frontmatter. */
export const StatusBadge = ({ status }: { status: PageStatus }) => (
  <Badge tone={TONE[status]}>{status[0].toUpperCase() + status.slice(1)}</Badge>
);

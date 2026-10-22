// A roadmap's milestones as Roadmap.tsx draws them, and in numbers for a panel page's banner.
import type { Root, RootContent } from "hast";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

export type MilestoneStatus = "done" | "now" | "next" | "later";

export interface Milestone {
  title: string;
  status: MilestoneStatus;
  version?: string;
  when?: string;
  /** What "done" means for it, in one line. */
  goal?: string;
  icon?: string;
  /** Its tasks: ticked, and all. */
  done: number;
  total: number;
  /** The milestone's Markdown: what it is, and its tasks. */
  body: ReactNode;
}

/** The props `sh-roadmap-milestone` gets from the server (server/markdown/elements.ts). */
export type MilestoneProps = {
  title?: string;
  status?: string;
  version?: string;
  when?: string;
  goal?: string;
  icon?: string;
  done?: string;
  total?: string;
  children?: ReactNode;
};

const STATUSES: MilestoneStatus[] = ["done", "now", "next", "later"];

export function milestonesOf(children: ReactNode): Milestone[] {
  const out: Milestone[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const p = (child as ReactElement<MilestoneProps>).props;
    out.push({
      title: p.title || `Milestone ${out.length + 1}`,
      status: STATUSES.includes(p.status as MilestoneStatus) ? (p.status as MilestoneStatus) : "next",
      version: p.version || undefined,
      when: p.when || undefined,
      goal: p.goal || undefined,
      icon: p.icon || undefined,
      done: Number(p.done) || 0,
      total: Number(p.total) || 0,
      body: p.children,
    });
  }
  return out;
}

/** The milestone the roadmap is about now: the one marked now, else the first not done, else the last. */
export function currentIndex(list: Milestone[]): number {
  const now = list.findIndex((m) => m.status === "now");
  if (now >= 0) return now;
  const open = list.findIndex((m) => m.status !== "done");
  return open >= 0 ? open : list.length - 1;
}

/** "0.2" reads as "v0.2"; a name ("Alpha") stays as written. */
export const versionLabel = (v: string) => (/^\d/.test(v) ? `v${v}` : v);

export const STATUS_LABEL: Record<MilestoneStatus, string> = { done: "Done", now: "Now", next: "Next", later: "Later" };

/** A page's roadmap in numbers, for a panel page's banner: the current milestone, and how far the rest are. */
export function roadmapSummary(hast: Root) {
  const found: Pick<Milestone, "title" | "status" | "version" | "done" | "total">[] = [];
  const walk = (node: Root | RootContent) => {
    if (node.type === "element" && node.tagName === "sh-roadmap-milestone") {
      const p = node.properties;
      found.push({
        title: String(p.title ?? ""),
        status: STATUSES.includes(p.status as MilestoneStatus) ? (p.status as MilestoneStatus) : "next",
        version: p.version ? String(p.version) : undefined,
        done: Number(p.done) || 0,
        total: Number(p.total) || 0,
      });
      return;
    }
    if ("children" in node) for (const c of node.children) walk(c as RootContent);
  };
  walk(hast);
  if (!found.length) return null;
  const now = found[currentIndex(found as Milestone[])];
  return {
    now,
    milestones: found.length,
    shipped: found.filter((m) => m.status === "done").length,
    done: found.reduce((n, m) => n + m.done, 0),
    total: found.reduce((n, m) => n + m.total, 0),
  };
}

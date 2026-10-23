// How reports' kinds and statuses read and look (ADR-0010). Icons are names from Shiori's drawn set.
import type { ReportKind, ReportStatus } from "../../shared/api.ts";
import type { BadgeTone } from "../ui/index.ts";

export const KIND: Record<ReportKind, { label: string; icon: string; hint: string; ask: string }> = {
  bug: {
    label: "Bug",
    icon: "bug",
    hint: "Something broke or acts wrong",
    ask: "What happened? How can it happen again? What did you expect instead?",
  },
  change: {
    label: "Change",
    icon: "pencil",
    hint: "Something should work differently",
    ask: "What should work differently, and why?",
  },
  idea: {
    label: "Idea",
    icon: "bulb",
    hint: "Something new for the game",
    ask: "What would make the game better?",
  },
};

export const STATUS: Record<ReportStatus, { label: string; tone: BadgeTone; done: boolean }> = {
  new: { label: "New", tone: "accent", done: false },
  planned: { label: "Planned", tone: "warn", done: false },
  fixed: { label: "Fixed", tone: "good", done: true },
  wontfix: { label: "Won't fix", tone: "neutral", done: true },
  duplicate: { label: "Duplicate", tone: "neutral", done: true },
};

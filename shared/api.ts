// Shapes the server sends to the browser.
import type { Root } from "hast";
import type { Quote } from "./quote.ts";
import type { Theme } from "./theme.ts";

export interface WikiCard {
  id: string;
  title: string;
  tagline: string;
  /** Cache-busted URL of the cover art. */
  coverUrl: string;
  accent: string;
  /** `local` lives in the app's `wikis/` folder, `linked` anywhere else (wikis.local.json). */
  source: "local" | "linked";
}

export interface NavNode {
  /** Page path without `.md`: `systems/combat`. The wiki's home page is "". */
  path: string;
  title: string;
  /** False for a folder without an `index.md`. */
  isPage: boolean;
  children: NavNode[];
}

export interface WikiDetail extends WikiCard {
  theme: Theme;
  nav: NavNode[];
  problems: string[];
}

export interface TocEntry {
  id: string;
  text: string;
  depth: 2 | 3;
}

export interface PageData {
  path: string;
  title: string;
  summary: string;
  toc: TocEntry[];
  /** Rendered Markdown: HTML elements plus `ld-*` elements for the Loredeck components. */
  hast: Root;
  problems: string[];
}

export type ThreadStatus = "open" | "resolved" | "wontfix";

export interface Message {
  id: number;
  author: "user" | "agent";
  body: string;
  createdAt: string;
}

export interface Thread {
  id: number;
  page: string;
  quote: Quote;
  status: ThreadStatus;
  createdAt: string;
  resolvedAt: string | null;
  messages: Message[];
}

/** Server-sent events on /api/events. */
export type LiveEvent = { type: "wikis" } | { type: "pages"; wiki: string } | { type: "threads"; wiki: string };

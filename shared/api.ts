// Shapes the server sends to the browser.
import type { Root } from "hast";
import type { Quote } from "./quote.ts";
import type { PageStatus } from "./schema.ts";
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
  /** Number of pages; the deck shows it as the card's level. */
  pages: number;
}

export interface NavNode {
  /** Page path without `.md`: `systems/combat`. The wiki's home page is "". */
  path: string;
  title: string;
  icon?: string;
  /** False for a folder without an `index.md`. */
  isPage: boolean;
  children: NavNode[];
}

/** Another page, as the page head, section cards and previous/next links show it. */
export interface PageLink {
  path: string;
  title: string;
  icon?: string;
  summary?: string;
  status?: PageStatus;
  /** False for a folder without an `index.md` (a breadcrumb with nothing to open). */
  isPage: boolean;
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

/** The fact box beside an article, from the page's frontmatter. Row values are rendered inline Markdown. */
export interface Infobox {
  image?: string;
  caption?: string;
  rows: { label: string; value: Root }[];
}

export interface PageData {
  path: string;
  title: string;
  summary: string;
  icon?: string;
  status?: PageStatus;
  tags: string[];
  /** The page's kind, in the project's own words ("Feature", "Product"). */
  type?: string;
  infobox?: Infobox;
  /** URL of a wide picture behind the page head. */
  banner?: string;
  /** The page file, from the wiki root (`pages/plan/goals.md`). */
  file?: string;
  /** Pages that link to this one. */
  backlinks: PageLink[];
  /** Pages from `related:` in the frontmatter, grouped by kind ("Related" when none is given). */
  related: { kind: string; pages: PageLink[] }[];
  /** Open decisions from the frontmatter's `questions:`. */
  questions: Question[];
  /** Elements the page places itself, so the app doesn't add them again at the bottom. */
  placed: { related: boolean; children: boolean; questions: string[] };
  /** When the page file last changed (ISO), and about how long it takes to read. */
  updatedAt?: string;
  minutes?: number;
  /** The pages above this one, from the home page down. */
  trail: PageLink[];
  /** The pages one level below, in sidebar order. */
  children: PageLink[];
  /** Neighbours in sidebar order, for reading straight through. */
  prev: PageLink | null;
  next: PageLink | null;
  toc: TocEntry[];
  /** Rendered Markdown: HTML elements plus `sh-*` elements for the Shiori components. */
  hast: Root;
  problems: string[];
}

/** A page in the wiki's index: what lists, special pages and link previews show. */
export interface PageEntry extends PageLink {
  type?: string;
  tags: string[];
  updatedAt?: string;
  hidden: boolean;
  /** The first lines of the page's text. */
  excerpt: string;
  image?: string;
}

/** A decision a page asks for. Resolved ones carry the agent's `answer`. */
export interface Question {
  id: string;
  text: string;
  options: string[];
  status: "open" | "resolved";
  answer?: string;
}

/** Someone's answer to a question: an option they picked and/or a note. */
export interface Answer extends Authored {
  /** Agents don't answer; they write the decision into the page. */
  author: "user" | "guest";
  id: number;
  page: string;
  question: string;
  choice: string | null;
  body: string;
  createdAt: string;
}

/** A question in the wiki-wide list (Special:Questions), with its page and how many answers it has. */
export interface QuestionEntry extends Question {
  page: PageLink;
  answers: number;
}

/** A page that red links point to but nobody has written yet, and the pages that link to it. */
export interface WantedPage {
  path: string;
  /** The link text it's wanted under. */
  title: string;
  from: PageLink[];
}

/** Everything lists, special pages and link previews need about a wiki's pages. */
/** A checkbox (`- [ ] …`) somewhere in the wiki, with its page and the heading it's under. */
export interface TaskEntry {
  page: PageLink;
  section?: { id: string; heading: string };
  text: string;
  done: boolean;
}

export interface WikiIndex {
  pages: PageEntry[];
  wanted: WantedPage[];
  questions: QuestionEntry[];
  tasks: TaskEntry[];
}

/** A picture in a page, for the image viewer. `src` is the server's URL, as in the page. */
export interface PageImage {
  src: string;
  caption?: string;
}

/** One page's pictures. A wiki's groups come in reading order (the sidebar's), so neighbours sit side by side. */
export interface ImageGroup {
  page: PageLink;
  /** The sections above the page, from the top: ["Weapons", "Swords"]. */
  trail: string[];
  images: PageImage[];
}

/** `[start, end)` ranges of a string that match the search. */
export type Marks = [number, number][];

/** One page found by a wiki search: where it is, the heading to jump to, and a snippet around the match. */
export interface SearchHit {
  path: string;
  title: string;
  icon?: string;
  titleMarks: Marks;
  section?: { id: string; heading: string; marks: Marks };
  snippet: string;
  marks: Marks;
}

export type ThreadStatus = "open" | "resolved" | "wontfix";

/**
 * Who wrote a message or an answer (ADR-0003): the owner (`user`), an agent through the CLI, or a guest who came
 * through a share link.
 */
export type Author = "user" | "agent" | "guest";

export interface Authored {
  author: Author;
  /** A guest's display name. Guests also see the owner's name here. */
  name?: string;
  /** The guest's id, for the owner's app and the CLI. Never sent to guests. */
  guestId?: string;
  /** Guests only: this guest wrote it. */
  mine?: boolean;
  /** Owner and CLI only: the owner hid this guest's text from guests and from the inbox. */
  hidden?: boolean;
}

export interface Message extends Authored {
  id: number;
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
/** `threads` means the wiki's data (comments and answers) changed. */
export type LiveEvent = { type: "wikis" } | { type: "pages"; wiki: string } | { type: "threads"; wiki: string };

/** What a share link lets a guest do (ADR-0003). */
export type ShareKind = "view" | "comment";
/** How long a share link lasts; `session` ends when Shiori closes. */
export type ShareDuration = "1h" | "24h" | "7d" | "session";

/** A share link, as the owner's app lists it. */
export interface ShareInfo {
  id: string;
  wiki: string;
  kind: ShareKind;
  label: string;
  createdAt: string;
  /** Null for links that last until Shiori closes. */
  expiresAt: string | null;
  /** The link's path on the guest server: `/s/<token>/`. */
  path: string;
  /** The full link: on the tunnel's public address while it's up, else the guest server's, for this PC only. */
  url: string;
  guests: ShareGuest[];
  /** Client addresses blocked for going over the limits. */
  blockedIps: number;
  activity: ShareActivity[];
}

/** Someone who joined through a link, as the owner sees them. */
export interface ShareGuest {
  /** For blocking; never shown to other guests. */
  id: string;
  name: string;
  joinedAt: string;
  lastSeen: string;
  /** Comments, replies and answers. */
  writes: number;
  blocked: boolean;
}

/**
 * The Cloudflare Quick Tunnel that gives links a public address: `off` with no link active, `missing` when
 * `cloudflared` isn't installed, `starting` until its address answers, `up`, or `failed` with why.
 */
export type TunnelState = "off" | "missing" | "starting" | "up" | "failed";

export interface TunnelStatus {
  state: TunnelState;
  /** The public address while `up`. */
  url: string | null;
  error?: string;
  /** The command that installs `cloudflared`, while it's `missing`. */
  install?: string;
}

/** `GET /api/shares`: every active link, the tunnel, and how the owner signs for guests. */
export interface SharesState {
  shares: ShareInfo[];
  tunnel: TunnelStatus;
  host: string;
}

export interface ShareActivity {
  at: string;
  /** The guest's name, or the client address before they join. */
  who: string;
  what: string;
}

/** What a guest's app learns about its link from `/s/<token>/api/session`. */
export interface GuestSession {
  wiki: { id: string; title: string };
  kind: ShareKind;
  expiresAt: string | null;
  /** Null until the guest picks a display name. */
  guest: { name: string } | null;
  /** How the owner's messages are signed for guests. */
  host: string;
}

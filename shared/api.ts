// Shapes the server sends to the browser.
import type { Root } from "hast";
import type { FileDiff } from "./diff.ts";
import type { Layout } from "./layout.ts";
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
  /** The project's icon in the header (`icon` in wiki.json), a name from Shiori's icon set. */
  icon?: string;
  /** Collections people add designs to (ADR-0006), from wiki.json. */
  collections: Record<string, { title: string; item: string }>;
  nav: NavNode[];
  /** The sidebar's pinned pages under Home (`pinned` in wiki.json), as they resolve. */
  pinned: PageLink[];
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
  /** The layout from `layout:` that arranges the page (ADR-0006), when it has one that's valid. */
  layout?: Layout & { name: string };
  /** The design the page was made from (`design:`). */
  design?: { collection: string; id: string };
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

/**
 * A decision a page asks for. A `question` asks about what the page describes; a `suggestion` is the agent's idea for
 * adding to it or improving it. Resolved ones carry the agent's `answer`.
 */
export interface Question {
  kind: "question" | "suggestion";
  id: string;
  text: string;
  options: string[];
  status: "open" | "resolved";
  answer?: string;
  /** When it should be decided by (`2026-11-15`). */
  due?: string;
  /** When the agent decided it. */
  decided?: string;
}

/** Someone's answer to a question: an option they picked and/or a note. */
/** What two PCs with the same wiki merge by (`pnpm wiki sync`): an id that never collides, and when it last changed. */
export interface Synced {
  uid?: string;
  updatedAt?: string;
}

export interface Answer extends Authored, Synced {
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

/** What a search can narrow to: pages with this status, type or tag. */
export interface SearchFilter {
  status?: PageStatus;
  type?: string;
  tag?: string;
}

/** A comment or an answer that matches a search, on its page. */
export interface NoteHit {
  kind: "comment" | "answer";
  path: string;
  /** The page's title and icon. */
  title: string;
  icon?: string;
  /** The thread's id for a comment, the question's id for an answer. */
  ref: string;
  /** Still open: an open thread, or an answer to an open question. */
  open: boolean;
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

/** The reactions people can leave on a message: agree, done, looking into it, love it. */
export const REACTIONS = ["👍", "✅", "👀", "❤️"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

/** Someone who reacted: the owner or a guest. Guests never see a guest's id, only whether it's them. */
export interface Reactor {
  author: "user" | "guest";
  name?: string;
  guestId?: string;
  mine?: boolean;
}

export interface Reaction {
  emoji: ReactionEmoji;
  by: Reactor[];
}

export interface Message extends Authored, Synced {
  id: number;
  body: string;
  createdAt: string;
  /** Who reacted with what, in the order the emoji were first used. */
  reactions?: Reaction[];
  /** Pictures attached to it: file names in the wiki's `data/attachments/`. */
  images?: string[];
}

export interface Thread extends Synced {
  /** This PC's number for it (`#12` in the inbox); another PC numbers it its own way. */
  id: number;
  page: string;
  quote: Quote;
  status: ThreadStatus;
  createdAt: string;
  resolvedAt: string | null;
  /** Removed by the host or by whoever started it: gone for everyone, kept in the database (never deleted). */
  removedAt?: string;
  messages: Message[];
}

/** Server-sent events on /api/events. */
/** `threads` means the wiki's data (comments and answers) changed. */
/** `shares` means share links, their guests or their activity changed (the Share dialog, ADR-0003). */
/** `presence` means who is on the wiki, or where, changed (ADR-0005). `designs`: a design was made or changed. */
export type LiveEvent =
  | { type: "wikis" }
  | { type: "pages"; wiki: string }
  | { type: "threads"; wiki: string }
  | { type: "shares" }
  | { type: "presence"; wiki: string }
  | { type: "designs"; wiki: string }
  /** A wiki's `.git` changed: a commit or a pull (ADR-0008). */
  | { type: "git"; wiki: string };

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

/** A page kit (`pnpm wiki page --kit`), as the toolbox lists it. */
export interface KitInfo {
  name: string;
  /** The kit's `kit:` line. */
  description: string;
  /** The wiki's own `kits/`, or the template's. */
  source: "wiki" | "template";
  icon?: string;
  /** The `type:` its pages get. */
  type?: string;
  /** Its `##` sections, in order. */
  sections: string[];
  /** The frontmatter fields it fills in. */
  fields: string[];
}

/** Someone on a wiki right now (ADR-0005): the host or a guest from a share link, and the page they're on. */
export interface Person {
  /** Stable while they stay; never a guest's id. */
  id: string;
  name: string;
  role: "host" | "guest";
  /** The page path, `_/…` for a special page, or null when they're on a page that doesn't exist. */
  page: string | null;
  /** That page's title, when it has one. */
  title?: string;
  lastSeen: string;
  /** This is you. */
  me?: boolean;
}

/** Where a design stands (ADR-0006): still being made, ready for the agent, or turned into a page. */
export type DesignStatus = "draft" | "ready" | "done";

/** A design as a viewer sees it. Never carries a guest's id. */
export interface DesignInfo {
  id: string;
  collection: string;
  name: string;
  description: string;
  status: DesignStatus;
  createdAt: string;
  updatedAt: string;
  /** Who made it: the owner (by the name guests know them by) or a guest. */
  author: { kind: "owner" | "guest"; name: string };
  /** The drawing's URL, changing with each save; null until someone draws. */
  board: string | null;
  images: { file: string; caption: string; url: string }[];
  /** The page it became, and the agent's note. */
  page: string | null;
  note: string;
  /** This viewer may change it: the owner always, a guest on a comment link only their own. */
  editable: boolean;
  /** This viewer made it. */
  mine: boolean;
  /** Owner only: hidden from guests. */
  hidden?: boolean;
}

/** Where a wiki's files are kept in git (ADR-0008), for the badge on its home page. The owner only. */
export interface GitInfo {
  /** False when the wiki's folder isn't in a git repo of its own. */
  repo: boolean;
  branch?: string;
  /** The wiki's folder inside the repo ("" at its top). */
  folder?: string;
  /** Files in the wiki's folder changed since the last commit. */
  changes?: number;
  /** The repo online, from its `origin` remote: its page, the wiki's folder there, and where commits are shown. */
  remote?: { name: string; host: string; url: string; folderUrl: string; commitUrl: string };
}

/** One commit that changed a page. */
export interface PageVersion {
  hash: string;
  short: string;
  /** When it was written (ISO). */
  date: string;
  author: string;
  subject: string;
  /** Lines added and removed in the page file. */
  added: number;
  removed: number;
}

/** A page's history from git, newest first. */
export interface PageHistory {
  /** The wiki is in a git repo. */
  git: boolean;
  /** The page file has been committed at least once. */
  tracked: boolean;
  /** The file has changes since its last commit (or was never committed). */
  uncommitted: boolean;
  versions: PageVersion[];
  /** Older versions weren't listed. */
  more: boolean;
}

/** One version of a page: what it changed, what changed since, and the page as it was. */
export interface PageVersionDetail {
  /** Null for the file as it is now, not committed yet. */
  version: PageVersion | null;
  /** Against the version before it. */
  changes: FileDiff;
  /** From this version to the page as it is now; null for the working copy. */
  sinceThen: FileDiff | null;
  /** The page as it was, rendered with the wiki as it is now. */
  page: PageData;
}

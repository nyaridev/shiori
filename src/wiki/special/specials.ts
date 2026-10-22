// The special pages under /w/<wiki>/_/ (ADR-0002), in the sidebar's order. `tools` list the wiki's own pages; the
// `toolbox` lists what pages can use (Toolbox.tsx). Icons are names from Shiori's icon set (public/icons/).
export const SPECIALS = [
  {
    route: "attention",
    group: "tools",
    icon: "bookmark",
    title: "Needs your attention",
    summary: "What changed since you last looked, replies to your comments, and questions waiting for your answer.",
  },
  {
    route: "recent",
    group: "tools",
    icon: "clock",
    title: "Recent changes",
    summary: "Every page, most recently edited first.",
  },
  {
    route: "tasks",
    group: "tools",
    icon: "checklist",
    title: "Tasks",
    summary: "Every checkbox in the wiki, page by page.",
  },
  {
    route: "pages",
    group: "tools",
    icon: "books",
    title: "All pages",
    summary: "Every page in the wiki, from A to Z.",
  },
  {
    route: "categories",
    group: "tools",
    icon: "tag",
    title: "Categories",
    summary: "Pages grouped by their tags, their status and their type.",
  },
  {
    route: "questions",
    group: "tools",
    icon: "question",
    title: "Questions and suggestions",
    summary:
      "Every question the pages ask and every suggestion the agent made for them, open ones first, with how many answers each has.",
  },
  {
    route: "decisions",
    group: "tools",
    icon: "scales",
    title: "Decisions",
    summary: "Every question the agent has decided, newest first: what was asked and what was chosen.",
  },
  {
    route: "wanted",
    group: "tools",
    icon: "puzzle",
    title: "Wanted pages",
    summary: "Pages that links point to but nobody has written yet, most wanted first.",
  },
  {
    route: "designs",
    group: "tools",
    icon: "pencil",
    title: "Designs",
    summary: "What people drew and described for the wiki's collections, for an agent to turn into pages.",
  },
  {
    route: "kits",
    group: "toolbox",
    icon: "toolbox",
    title: "Page kits",
    summary: "The kinds of page agents start from, with what each holds and the command that makes one.",
  },
  {
    route: "elements",
    group: "toolbox",
    icon: "blocks",
    title: "Elements",
    summary: "Every element a page can use, as written and as shown in this wiki's theme.",
  },
  {
    route: "fields",
    group: "toolbox",
    icon: "bookmark",
    title: "Page fields",
    summary: "What a page's frontmatter can set: title, icon, status, infobox, questions and the rest.",
  },
  {
    route: "icons",
    group: "toolbox",
    icon: "palette",
    title: "Icons",
    summary: "Shiori's drawn icons, by name: what a page's `icon` picks from before drawing its own.",
  },
  {
    route: "special",
    group: "toolbox",
    icon: "cabinet",
    title: "Special pages",
    summary: "The wiki-wide lists the app makes from the pages, like this one.",
  },
] as const;

export type Special = (typeof SPECIALS)[number];

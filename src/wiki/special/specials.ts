// The special pages under /w/<wiki>/_/ (ADR-0002), in the sidebar's order: the Tools, which list the wiki's own pages.
// What pages can use (kits, elements, fields, icons) is the host's toolbox, src/toolbox/. Icons are names from Shiori's icon set (public/icons/).
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
      "Every question the pages ask and every suggestion the agent made for them, with how many answers each has; answer the open ones all on one page.",
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
    route: "boards",
    group: "tools",
    icon: "bug",
    title: "Test boards",
    summary:
      "Boards for your game's testers: share one, and the bugs, changes and ideas they report land here, with their pictures.",
  },
  {
    route: "sheets",
    group: "tools",
    icon: "table",
    title: "Data sheets",
    summary:
      "Tables of game data an agent prepared, like every mob's health. Tune the values here, or share one sheet so others can.",
  },
] as const;

export type Special = (typeof SPECIALS)[number];

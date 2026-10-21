// The special pages under /w/<wiki>/_/ (ADR-0002), in the sidebar's order. `tools` list the wiki's own pages; the
// `toolbox` lists what pages can use (Toolbox.tsx).
export const SPECIALS = [
  {
    route: "recent",
    group: "tools",
    icon: "🕘",
    title: "Recent changes",
    summary: "Every page, most recently edited first.",
  },
  { route: "tasks", group: "tools", icon: "✅", title: "Tasks", summary: "Every checkbox in the wiki, page by page." },
  { route: "pages", group: "tools", icon: "📚", title: "All pages", summary: "Every page in the wiki, from A to Z." },
  { route: "categories", group: "tools", icon: "🏷️", title: "Categories", summary: "Pages grouped by their tags." },
  {
    route: "questions",
    group: "tools",
    icon: "❓",
    title: "Questions",
    summary: "Every decision the pages ask for, open ones first, with how many answers each has.",
  },
  {
    route: "wanted",
    group: "tools",
    icon: "🧩",
    title: "Wanted pages",
    summary: "Pages that links point to but nobody has written yet, most wanted first.",
  },
  {
    route: "kits",
    group: "toolbox",
    icon: "🧰",
    title: "Page kits",
    summary: "The kinds of page agents start from, with what each holds and the command that makes one.",
  },
  {
    route: "elements",
    group: "toolbox",
    icon: "🧱",
    title: "Elements",
    summary: "Every element a page can use, as written and as shown in this wiki's theme.",
  },
  {
    route: "fields",
    group: "toolbox",
    icon: "🔖",
    title: "Page fields",
    summary: "What a page's frontmatter can set: title, icon, status, infobox, questions and the rest.",
  },
  {
    route: "special",
    group: "toolbox",
    icon: "🗂️",
    title: "Special pages",
    summary: "The wiki-wide lists the app makes from the pages, like this one.",
  },
] as const;

export type Special = (typeof SPECIALS)[number];

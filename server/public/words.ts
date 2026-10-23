// The public wiki's own words (ADR-0011), in English. A wiki says them in its own language with `public.words`.
import type { PUBLIC_WORDS, PublicSettings } from "../../shared/schema.ts";

export type Words = Record<(typeof PUBLIC_WORDS)[number], string>;

export const ENGLISH: Words = {
  home: "Home",
  search: "Search the wiki…",
  start: "Where to start",
  spoilers: "Show all spoilers",
  contents: "Contents",
  related: "Related pages",
  inSection: "In this section",
  noResults: "Nothing found",
  updated: "Updated",
  previous: "Previous",
  next: "Next",
  pages: "Navigation",
  notFound: "This page isn't in the wiki.",
  skip: "Skip to the page",
  day: "Day",
  night: "Night",
  recent: "Recently updated",
};

export const wordsOf = (settings: PublicSettings): Words => ({ ...ENGLISH, ...settings.words });

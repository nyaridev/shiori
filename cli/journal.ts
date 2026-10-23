// `pnpm shiori journal` (ADR-0013): the development journal's entries still waiting for the wiki, with what each one
// touches, so the agent merging them knows which files to check and which pages to change.
import { readJournal } from "../server/journal.ts";
import { slashes } from "../server/paths.ts";
import type { Wiki } from "../server/registry.ts";

const MERGE =
  "Merge one at a time: read its files as they are now and check every value and behaviour in the project's code and" +
  " data (the entry can be wrong or out of date), change the pages, add the History line, then set the entry's" +
  " `status: merged` and `merged: <today>`. JOURNAL.md has the steps.";

export function journal(w: Wiki, all: boolean) {
  const entries = readJournal(w.root).filter((j) => all || !j.entry || j.entry.status === "open");
  for (const j of entries) {
    const e = j.entry;
    const head = e
      ? [e.status === "open" ? "" : `[${e.status}]`, e.kind, e.version && `v${e.version}`, e.title]
      : ["(can't read)"];
    console.log(`${j.file}  ${head.filter(Boolean).join("  ")}`);
    if (e?.pages.length) console.log(`    pages: ${e.pages.join(", ")}`);
    if (e?.files.length) console.log(`    files: ${e.files.join(", ")}`);
    if (e?.commit) console.log(`    commit: ${e.commit}`);
    for (const p of j.problems) console.log(`    ✗ ${p}`);
  }
  const open = entries.filter((j) => j.entry?.status === "open").length;
  if (!entries.length) console.log(all ? "The journal is empty." : "Nothing waiting: every entry is in the wiki.");
  else if (open) console.log(`\n${open} waiting in ${slashes(w.root)}/journal/. ${MERGE}`);
}

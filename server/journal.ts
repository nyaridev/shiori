// A wiki's development journal (ADR-0013): what changed in the project, written by the agents working on it, for the
// wiki to pick up when the owner asks. One Markdown file per entry in `journal/`; the app never writes there.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { issues, type JournalEntry, journalEntrySchema } from "../shared/schema.ts";
import { splitFrontmatter } from "./markdown/frontmatter.ts";

export interface JournalFile {
  /** From the wiki's root: `journal/2026-10-23-lantern-radius.md`. */
  file: string;
  entry: JournalEntry | null;
  body: string;
  problems: string[];
}

/** Every entry, oldest first (file names start with their day). */
export function readJournal(root: string): JournalFile[] {
  const dir = join(root, "journal");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && !name.startsWith("_"))
    .sort()
    .map((name) => {
      const file = `journal/${name}`;
      const split = splitFrontmatter(readFileSync(join(dir, name), "utf8"));
      const parsed = journalEntrySchema.safeParse(split.data);
      const problems = split.error ? [split.error] : [];
      if (!parsed.success) problems.push(...issues(parsed.error).map((i) => `frontmatter: ${i}`));
      if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(name)) problems.push("name it <day>-<what-changed>.md");
      return { file, entry: parsed.success ? parsed.data : null, body: split.body.trim(), problems };
    });
}

/** What `pnpm shiori check` reports about the journal. */
export const journalProblems = (root: string) =>
  readJournal(root).flatMap((j) => j.problems.map((p) => `${j.file} ${p}`));

// The development journal (ADR-0013): entries read oldest first, and what `pnpm shiori check` says about bad ones.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { journalProblems, readJournal } from "./journal.ts";

let root: string;
const entry = (name: string, text: string) => writeFileSync(join(root, "journal", name), text);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shiori-journal-"));
  mkdirSync(join(root, "journal"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("the journal", () => {
  it("is empty without a journal folder", () => {
    rmSync(join(root, "journal"), { recursive: true });
    expect(readJournal(root)).toEqual([]);
  });

  it("reads entries oldest first, open unless they say otherwise, with lists from single values", () => {
    entry(
      "2026-10-24-oil-stacks.md",
      '---\ntitle: "Oil stacks to 20"\ndate: 2026-10-24\nstatus: merged\nmerged: 2026-10-25\n---\nDone.',
    );
    entry(
      "2026-10-23-lantern-radius.md",
      '---\ntitle: "Radius 10 → 12"\ndate: 2026-10-23\nkind: changed\nversion: 0.3\npages: Glow lantern\nfiles:\n  - src/Lantern.luau\n---\n\n12 studs.\n',
    );
    entry("_draft.md", "Not an entry.");
    const [first, second] = readJournal(root);
    expect(first.file).toBe("journal/2026-10-23-lantern-radius.md");
    expect(first.entry).toMatchObject({
      status: "open",
      kind: "changed",
      version: "0.3",
      pages: ["Glow lantern"],
      files: ["src/Lantern.luau"],
    });
    expect(first.body).toBe("12 studs.");
    expect(second.entry).toMatchObject({ status: "merged", merged: "2026-10-25" });
    expect(readJournal(root)).toHaveLength(2);
    expect(journalProblems(root)).toEqual([]);
  });

  it("reports entries it can't read, and names that don't start with their day", () => {
    entry("oops.md", "---\ndate: tomorrow\nstatus: done\n---\n");
    const problems = journalProblems(root);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^journal\/oops\.md frontmatter: title/),
        expect.stringMatching(/date: write a day/),
        expect.stringMatching(/status: /),
        "journal/oops.md name it <day>-<what-changed>.md",
      ]),
    );
  });
});

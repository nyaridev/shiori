import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addAnswer, listAnswers, setAnswerHidden } from "./answers.ts";
import { syncFiles, syncWiki } from "./sync.ts";
import { addMessage, closeAll, createThread, listThreads, react, setStatus } from "./threads.ts";

let tmp: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A PC: a wiki folder with a fixed name for its sync file. */
function pc(dir: string, name: string) {
  mkdirSync(join(dir, "data"), { recursive: true });
  writeFileSync(join(dir, "data", ".gitignore"), "*\n");
  writeFileSync(join(dir, "data", "machine.json"), JSON.stringify({ id: "0001", name }));
  return dir;
}

const quote = { exact: "", prefix: "", suffix: "" };
const uids = (root: string) => listThreads(root).map((t) => [t.uid, t.status, t.messages.map((m) => m.body)]);

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "shiori-sync-"));
});
afterEach(() => {
  closeAll();
  rmSync(tmp, { recursive: true, force: true });
});

describe("sync files", () => {
  it("merge two PCs' comments without duplicates, and the newer change wins", () => {
    const a = pc(join(tmp, "a"), "desk");
    const b = pc(join(tmp, "b"), "laptop");
    const ta = createThread(a, "plan", quote, "From the desk");
    const tb = createThread(b, "plan", quote, "From the laptop");
    addAnswer(b, "plan", "q1", "Steam", "", { guest: "g1", name: "Ana" });

    // Carry each PC's file over, as git would.
    const carry = (from: string, to: string, file: string) => {
      mkdirSync(join(to, "sync"), { recursive: true });
      writeFileSync(join(to, file), readFileSync(join(from, file)));
    };
    const fa = syncFiles(a);
    expect(fa).toMatchObject({ file: "sync/desk-0001.json", wrote: true, read: [] });
    carry(a, b, fa.file);
    const fb = syncFiles(b);
    expect(fb.merged.added).toEqual({ threads: 1, messages: 1, answers: 0 });
    carry(b, a, fb.file);
    expect(syncFiles(a).merged.added).toEqual({ threads: 1, messages: 1, answers: 1 });
    expect(new Set(uids(a))).toEqual(new Set(uids(b)));

    // Nothing new: nothing merged, nothing written.
    expect(syncFiles(a)).toMatchObject({ merged: { added: { threads: 0, messages: 0, answers: 0 }, updated: 0 } });
    expect(syncFiles(a).wrote).toBe(false);

    // The desk resolves the laptop's thread and hides the guest's answer; the laptop replies to the desk's thread.
    const laptopsThread = listThreads(a).find((t) => t.uid === tb.uid);
    setStatus(a, laptopsThread?.id ?? 0, "resolved");
    setAnswerHidden(a, listAnswers(a)[0].id, true);
    // Each PC numbers threads its own way (both have a #1), so find the desk's thread by its uid.
    addMessage(b, listThreads(b).find((t) => t.uid === ta.uid)?.id ?? 0, "agent", "Done");
    carry(a, b, syncFiles(a).file);
    carry(b, a, syncFiles(b).file);
    syncFiles(a);
    for (const root of [a, b]) {
      const threads = listThreads(root);
      expect(threads.find((t) => t.uid === tb.uid)?.status).toBe("resolved");
      expect(threads.find((t) => t.uid === ta.uid)?.messages.map((m) => m.body)).toEqual(["From the desk", "Done"]);
      expect(listAnswers(root)[0].hidden).toBe(true);
    }
  });
});

describe("sync files, later changes", () => {
  it("carry reactions and changed answers to the other PC", () => {
    const a = pc(join(tmp, "a"), "desk");
    const b = pc(join(tmp, "b"), "laptop");
    const carry = (from: string, to: string, file: string) => {
      mkdirSync(join(to, "sync"), { recursive: true });
      writeFileSync(join(to, file), readFileSync(join(from, file)));
    };
    const t = createThread(a, "plan", quote, "Ship it?");
    addAnswer(a, "plan", "q1", "Steam", "");
    carry(a, b, syncFiles(a).file);
    syncFiles(b);

    // The laptop reacts and the owner changes their answer there.
    const there = listThreads(b).find((x) => x.uid === t.uid);
    react(b, there?.messages[0].id ?? 0, "👍", "user", true);
    addAnswer(b, "plan", "q1", "itch.io", "Changed my mind");
    carry(b, a, syncFiles(b).file);
    syncFiles(a);

    expect(listThreads(a)[0].messages[0].reactions).toEqual([{ emoji: "👍", by: [{ author: "user" }] }]);
    expect(listAnswers(a).map((x) => [x.choice, x.body])).toEqual([["itch.io", "Changed my mind"]]);
  });
});

describe("pnpm wiki sync", () => {
  it("pulls, merges, commits only its own file and pushes, so two clones meet", () => {
    const remote = join(tmp, "remote.git");
    git(tmp, "init", "--bare", "-b", "main", remote);
    const a = join(tmp, "a");
    git(tmp, "clone", "-q", remote, a);
    for (const [k, v] of [
      ["user.name", "Test"],
      ["user.email", "test@example.com"],
    ])
      git(a, "config", k, v);
    git(a, "checkout", "-q", "-b", "main");
    writeFileSync(join(a, "wiki.json"), "{}");
    git(a, "add", ".");
    git(a, "commit", "-q", "-m", "Wiki");
    git(a, "push", "-q", "-u", "origin", "main");
    const b = join(tmp, "b");
    git(tmp, "clone", "-q", remote, b);
    for (const [k, v] of [
      ["user.name", "Test"],
      ["user.email", "test@example.com"],
    ])
      git(b, "config", k, v);
    pc(a, "desk");
    pc(b, "laptop");

    createThread(a, "plan", quote, "Desk says hi");
    expect(syncWiki(a).steps).toEqual(["Pulled.", "Committed sync/desk-0001.json.", "Pushed."]);
    createThread(b, "plan", quote, "Laptop says hi");
    const fromB = syncWiki(b);
    expect(fromB.merged.added.threads).toBe(1);
    expect(fromB.steps).toEqual(["Pulled.", "Committed sync/laptop-0001.json.", "Pushed."]);
    syncWiki(a);
    expect(new Set(uids(a))).toEqual(new Set(uids(b)));

    // Only the sync file is committed; the database and the PC's name never are.
    expect(git(a, "show", "--name-only", "--format=", "HEAD")).toBe("sync/desk-0001.json");
    expect(git(a, "show", "--name-only", "--format=", "HEAD~1")).toBe("sync/laptop-0001.json");
    expect(git(a, "ls-files")).not.toMatch(/data\//);
    // A sync with nothing new commits nothing.
    expect(syncWiki(b).steps).toEqual(["Pulled.", "Nothing new to commit."]);
    expect(existsSync(join(b, "sync", "desk-0001.json"))).toBe(true);
    // About 30 real git commands: slow on Windows while the rest of the suite runs.
  }, 30_000);

  it("only merges and writes in a folder that isn't in git", () => {
    const a = pc(join(tmp, "plain"), "desk");
    createThread(a, "", quote, "Hi");
    const result = syncWiki(a);
    expect(result.steps).toEqual(["Not in git: merged and wrote the sync files only."]);
    expect(existsSync(join(a, "sync", "desk-0001.json"))).toBe(true);
  });

  it("leaves alone a repo that ignores the wiki (a wiki in Shiori's own wikis/)", () => {
    const app = join(tmp, "app");
    git(tmp, "init", "-q", "-b", "main", app);
    writeFileSync(join(app, ".gitignore"), "wikis/*\n");
    const w = pc(join(app, "wikis", "mine"), "desk");
    createThread(w, "", quote, "Hi");
    expect(syncWiki(w).steps).toEqual(["Not in git: merged and wrote the sync files only."]);
    expect(git(app, "status", "--porcelain")).toBe("?? .gitignore");
  });
});

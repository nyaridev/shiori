// Git (ADR-0008): the home page's badge and each page's history, read from a real throwaway repo.
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GitInfo, PageHistory, PageVersionDetail, WikiIndex } from "../shared/api.ts";
import { committedTimes, forgetGit, gitInfo, renamedTo, webOf } from "./git.ts";
import { sharingFixture } from "./sharing/fixture.ts";

const s = sharingFixture();
const json = async <T>(res: Response) => (await res.json()) as T;

/** Runs git as a person would, with a fixed author and a clock that says `date`. */
const gitAt =
  (date: string) =>
  (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=Nari", "-c", "user.email=nari@example.com", ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    }).trim();
const git = gitAt("2026-10-20T10:00:00Z");
const alpha = () => join(s.app, "wikis", "alpha");
const page = (text: string, file = "plan.md") => writeFileSync(join(alpha(), "pages", file), text);

/** Makes wiki alpha a repo of its own: a first commit, then two edits to the plan. Answers the commits, oldest first. */
function history() {
  const root = alpha();
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "First pages");
  page("---\ntitle: Plan\n---\nThe plan.\n\nShip it in May.");
  git(root, "commit", "-q", "-am", "Plan: when to ship");
  page("---\ntitle: Plan\n---\nThe plan.\n\nShip it in June.");
  git(root, "commit", "-q", "-am", "Plan: a month later");
  forgetGit();
  return git(root, "log", "--format=%H", "--reverse").split("\n");
}

describe("remotes", () => {
  it("finds the web page of the usual remote forms", () => {
    expect(webOf("git@github.com:nyaridev/shiori.git")).toEqual({
      host: "github.com",
      name: "nyaridev/shiori",
      url: "https://github.com/nyaridev/shiori",
    });
    expect(webOf("https://nari:token@github.com/nari-games/fish-dive.git")?.url).toBe(
      "https://github.com/nari-games/fish-dive",
    );
    expect(webOf("ssh://git@gitlab.com:2222/group/sub/repo.git")?.url).toBe("https://gitlab.com/group/sub/repo");
  });

  it("has no page for a folder, a drive or an SSH alias", () => {
    expect(webOf("D:/remotes/wiki.git")).toBeNull();
    expect(webOf("/srv/git/wiki.git")).toBeNull();
    expect(webOf("file:///srv/git/wiki.git")).toBeNull();
    expect(webOf("work:nyaridev/shiori.git")).toBeNull();
  });

  it("reads where git's numstat says a renamed file went", () => {
    expect(renamedTo("pages/{plan.md => goals.md}")).toBe("pages/goals.md");
    expect(renamedTo("pages/{ => plan}/goals.md")).toBe("pages/plan/goals.md");
    expect(renamedTo("old.md => new.md")).toBe("new.md");
    expect(renamedTo("pages/plan.md")).toBe("pages/plan.md");
  });
});

describe("the badge", () => {
  it("says a wiki that isn't in git isn't", async () => {
    expect(await json<GitInfo>(await s.owner("/api/wikis/alpha/git"))).toEqual({ repo: false });
  });

  it("names the branch, the remote, the wiki's folder there and what isn't committed", async () => {
    git(s.app, "init", "-q", "-b", "main");
    git(s.app, "add", "wikis/alpha");
    git(s.app, "commit", "-q", "-m", "Alpha");
    git(s.app, "remote", "add", "origin", "git@github.com:nyaridev/notes.git");
    page("Changed.");
    const info = await json<GitInfo>(await s.owner("/api/wikis/alpha/git"));
    expect(info).toMatchObject({ repo: true, branch: "main", folder: "wikis/alpha", changes: 1 });
    expect(info.remote).toMatchObject({
      name: "nyaridev/notes",
      folderUrl: "https://github.com/nyaridev/notes/tree/main/wikis/alpha",
      commitUrl: "https://github.com/nyaridev/notes/commit",
    });
  });

  it("doesn't count a repo that ignores the wiki (Shiori's own wikis/)", async () => {
    git(s.app, "init", "-q");
    writeFileSync(join(s.app, ".gitignore"), "wikis/*\n");
    expect((await gitInfo(alpha(), 0)).repo).toBe(false);
  });

  it("isn't sent to guests", async () => {
    const share = s.shares.create({ wiki: "alpha", kind: "comment" });
    const b = s.browser(share);
    await b.join("Mika");
    expect((await b.get("/api/wikis/alpha/git")).status).toBe(404);
  });
});

describe("a page's history", () => {
  it("lists the page's commits, newest first, with their size", async () => {
    const [first, second, third] = history();
    const h = await json<PageHistory>(await s.owner("/api/wikis/alpha/history?path=plan"));
    expect(h).toMatchObject({ git: true, tracked: true, uncommitted: false, more: false });
    expect(h.versions.map((v) => v.hash)).toEqual([third, second, first]);
    expect(h.versions[0]).toMatchObject({ subject: "Plan: a month later", author: "Nari", added: 1, removed: 1 });
    expect(h.versions[0]).not.toHaveProperty("path");
    // The home page only changed in the first commit.
    const home = await json<PageHistory>(await s.owner("/api/wikis/alpha/history?path="));
    expect(home.versions.map((v) => v.hash)).toEqual([first]);
  });

  it("shows a version: what it changed, what changed since, and the page as it was", async () => {
    const [, second] = history();
    const v = await json<PageVersionDetail>(await s.owner(`/api/wikis/alpha/history/${second}?path=plan`));
    expect(v.version?.subject).toBe("Plan: when to ship");
    expect(v.changes.added).toBe(2);
    expect(v.sinceThen?.hunks.flatMap((h) => h.lines.filter((l) => l.kind !== "same").map((l) => l.text))).toEqual([
      "Ship it in May.",
      "Ship it in June.",
    ]);
    expect(JSON.stringify(v.page.hast)).toContain("Ship it in May.");
    expect(v.page.updatedAt).toBe("2026-10-20T10:00:00Z");
  });

  it("shows what isn't committed yet as the working copy", async () => {
    history();
    page("---\ntitle: Plan\n---\nThe plan.\n\nShip it in July.");
    const h = await json<PageHistory>(await s.owner("/api/wikis/alpha/history?path=plan"));
    expect(h.uncommitted).toBe(true);
    const v = await json<PageVersionDetail>(await s.owner("/api/wikis/alpha/history/working?path=plan"));
    expect(v.version).toBeNull();
    expect(v.sinceThen).toBeNull();
    expect(v.changes).toMatchObject({ added: 1, removed: 1 });
  });

  it("follows a page through a rename", async () => {
    const [first] = history();
    mkdirSync(join(alpha(), "pages", "plan"));
    renameSync(join(alpha(), "pages", "plan.md"), join(alpha(), "pages", "plan", "goals.md"));
    git(alpha(), "add", "-A");
    git(alpha(), "commit", "-q", "-m", "Plan becomes Goals");
    s.emit({ type: "pages", wiki: "alpha" });
    const h = await json<PageHistory>(await s.owner("/api/wikis/alpha/history?path=plan/goals"));
    expect(h.versions).toHaveLength(4);
    const v = await json<PageVersionDetail>(await s.owner(`/api/wikis/alpha/history/${first}?path=plan/goals`));
    expect(JSON.stringify(v.page.hast)).toContain("The plan.");
  });

  it("opens only the page's own versions", async () => {
    history();
    writeFileSync(join(alpha(), "notes.md"), "secret");
    git(alpha(), "add", "notes.md");
    git(alpha(), "commit", "-q", "-m", "Notes");
    const other = git(alpha(), "rev-parse", "HEAD");
    expect((await s.owner(`/api/wikis/alpha/history/${other}?path=plan`)).status).toBe(404);
    expect((await s.owner("/api/wikis/alpha/history/HEAD?path=plan")).status).toBe(404);
    expect((await s.owner(`/api/wikis/alpha/history/${other}:notes.md?path=plan`)).status).toBe(404);
    // Nothing changed since the last commit: there's no working copy to show.
    expect((await s.owner("/api/wikis/alpha/history/working?path=plan")).status).toBe(404);
    expect((await s.owner("/api/wikis/alpha/history?path=nope")).status).toBe(404);
  });

  it("is empty for a wiki that isn't in git", async () => {
    const h = await json<PageHistory>(await s.owner("/api/wikis/alpha/history?path=plan"));
    expect(h).toEqual({ git: false, tracked: false, uncommitted: false, versions: [], more: false });
  });
});

describe("when a page was updated", () => {
  /** Gives the wiki's page files the time on disk a clone or a pull would: all the same, after the commits. */
  const touch = (at = "2026-10-21T08:00:00Z", ...files: string[]) => {
    for (const f of files.length ? files : ["index.md", "plan.md"])
      utimesSync(join(alpha(), "pages", f), 0, new Date(at));
  };
  /** Each page's time, as the page index (Recent changes, the sidebar's dots) has it. */
  const times = async () => {
    const index = await json<WikiIndex>(await s.owner("/api/wikis/alpha/pages"));
    return Object.fromEntries(index.pages.map((p) => [p.path, p.updatedAt]));
  };
  /** The same, after the files changed. */
  const updated = () => {
    s.emit({ type: "pages", wiki: "alpha" });
    return times();
  };

  it("is the file's time in a wiki that isn't in git", async () => {
    touch();
    expect(await updated()).toEqual({ "": "2026-10-21T08:00:00.000Z", plan: "2026-10-21T08:00:00.000Z" });
  });

  it("is the page's last commit, not when a clone or a pull wrote the file", async () => {
    const root = alpha();
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "First pages");
    page("---\ntitle: Plan\n---\nThe plan, later.");
    gitAt("2026-10-20T15:30:00+02:00")(root, "commit", "-q", "-am", "Plan: later");
    touch();
    expect(await updated()).toEqual({ "": "2026-10-20T10:00:00.000Z", plan: "2026-10-20T13:30:00.000Z" });
    // The page itself says the same.
    const plan = await json<{ updatedAt: string }>(await s.owner("/api/wikis/alpha/page?path=plan"));
    expect(plan.updatedAt).toBe("2026-10-20T13:30:00.000Z");
  });

  it("is the file's time while it has changes not committed, or was never committed", async () => {
    history();
    page("---\ntitle: Plan\n---\nNot committed yet.");
    writeFileSync(join(alpha(), "pages", "ideas.md"), "New.");
    touch("2026-10-21T09:00:00Z", "plan.md", "ideas.md");
    touch("2026-10-21T08:00:00Z", "index.md");
    expect(await updated()).toEqual({
      "": "2026-10-20T10:00:00.000Z",
      plan: "2026-10-21T09:00:00.000Z",
      ideas: "2026-10-21T09:00:00.000Z",
    });
    // Staged counts as not committed too.
    git(alpha(), "add", "-A");
    expect((await updated()).plan).toBe("2026-10-21T09:00:00.000Z");
  });

  it("isn't an old commit's for a file deleted in it and made again", async () => {
    history();
    git(alpha(), "rm", "-q", "pages/plan.md");
    git(alpha(), "commit", "-q", "-m", "No plan");
    page("---\ntitle: Plan\n---\nA new plan.");
    touch("2026-10-21T09:00:00Z", "plan.md");
    expect((await updated()).plan).toBe("2026-10-21T09:00:00.000Z");
  });

  it("stays the file's time when that's earlier: committing doesn't make a page new again", async () => {
    history();
    touch("2026-10-19T09:00:00Z", "plan.md");
    expect((await updated()).plan).toBe("2026-10-19T09:00:00.000Z");
  });

  it("reads paths in a repo the wiki is a folder of, and none from a repo that ignores it", async () => {
    git(s.app, "init", "-q", "-b", "main");
    git(s.app, "add", "wikis/alpha");
    git(s.app, "commit", "-q", "-m", "Alpha");
    expect(committedTimes(alpha())).toEqual(
      new Map([
        ["pages/index.md", "2026-10-20T10:00:00.000Z"],
        ["pages/plan.md", "2026-10-20T10:00:00.000Z"],
      ]),
    );
    rmSync(join(s.app, ".git"), { recursive: true, force: true });
    git(s.app, "init", "-q");
    writeFileSync(join(s.app, ".gitignore"), "wikis/*\n");
    expect(committedTimes(alpha()).size).toBe(0);
  });

  it("is read again after a commit, without a page changing", async () => {
    history();
    touch();
    expect((await updated()).plan).toBe("2026-10-20T10:00:00.000Z");
    // The last commit, made again an hour before the files were written: only `.git` changes.
    gitAt("2026-10-21T07:00:00Z")(alpha(), "commit", "-q", "--amend", "--no-edit", "--reset-author");
    expect((await times()).plan).toBe("2026-10-20T10:00:00.000Z");
    s.emit({ type: "git", wiki: "alpha" });
    expect((await times()).plan).toBe("2026-10-21T07:00:00.000Z");
  });
});

// AGENTS.md rule 2: a guest route is checked for the link, other wikis, expiry, view links, limits and Origin.
describe("history for guests", () => {
  it("is there on view and comment links, for the link's own wiki, after a name", async () => {
    const [, second] = history();
    const share = s.shares.create({ wiki: "alpha", kind: "view" });
    const b = s.browser(share);
    expect((await b.get("/api/wikis/alpha/history?path=plan")).status).toBe(401);
    await b.join("Mika");
    const h = await json<PageHistory>(await b.get("/api/wikis/alpha/history?path=plan"));
    expect(h.versions).toHaveLength(3);
    expect((await b.get(`/api/wikis/alpha/history/${second}?path=plan`)).status).toBe(200);
    expect((await b.get("/api/wikis/beta/history?path=plan")).status).toBe(404);
    expect((await b.get(`/api/wikis/beta/history/${second}?path=plan`)).status).toBe(404);
  });

  it("ends with the link", async () => {
    history();
    const share = s.shares.create({ wiki: "alpha", kind: "comment", duration: "1h" });
    const b = s.browser(share);
    await b.join("Mika");
    s.clock += 2 * 3_600_000;
    expect((await b.get("/api/wikis/alpha/history?path=plan")).status).toBe(410);
  });

  it("counts toward the read limit and takes no writes", async () => {
    history();
    const share = s.shares.create({ wiki: "alpha", kind: "comment" });
    const b = s.browser(share);
    await b.join("Mika");
    expect((await b.send("POST", "/api/wikis/alpha/history?path=plan", {})).status).toBe(404);
    let limited = false;
    for (let i = 0; i < 60 && !limited; i++) limited = (await b.get("/api/wikis/alpha/history?path=")).status === 429;
    expect(limited).toBe(true);
  });
});

// A wiki's git (ADR-0008): whether its folder is in a repo of its own, where that repo is online, and each page's
// history. Everything is read from git on this PC; Shiori never commits, checks out or fetches here (`shiori sync` is the
// CLI's). A wiki in Shiori's own `wikis/` sits inside the app's repo but is ignored by it, so it has no git.
import { type ExecFileOptions, execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import type { GitInfo, PageHistory, PageVersion } from "../shared/api.ts";

const exec = promisify(execFile);

/** How git runs: reads never take the index lock, never ask for a password, and answer in plain words. */
const options = (cwd: string): ExecFileOptions => ({
  cwd,
  maxBuffer: 64 * 1024 * 1024,
  windowsHide: true,
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
});

/** Runs git in `cwd` and answers its output; throws when git fails. */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-c", "core.quotepath=off", ...args], { ...options(cwd), encoding: "utf8" });
  return stdout;
}
const tryGit = (cwd: string, ...args: string[]) => git(cwd, ...args).catch(() => null);

/** The same, waiting for git, for the corpus, which is built in one go; null when git fails. */
function gitNow(cwd: string, ...args: string[]): string | null {
  try {
    return execFileSync("git", ["-c", "core.quotepath=off", ...args], {
      ...options(cwd),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

interface Repo {
  /** The repo's top folder. */
  top: string;
  /** The wiki's folder inside it, with a trailing slash ("" at the top). */
  prefix: string;
}

/** The repo the wiki's folder is in, or null when it isn't in one (or the repo ignores it). */
async function repoOf(root: string): Promise<Repo | null> {
  const out = await tryGit(root, "rev-parse", "--show-toplevel", "--show-prefix");
  if (out === null) return null;
  const [top = "", prefix = ""] = out.split("\n");
  if (prefix && (await tryGit(root, "check-ignore", "-q", ".")) !== null) return null;
  return { top, prefix };
}

/** The web page of a remote (`git@github.com:o/r.git`, `https://user@host/o/r`), or null for a folder or alias. */
export function webOf(remote: string): { host: string; name: string; url: string } | null {
  let host: string;
  let path: string;
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/.exec(remote);
  if (scp) [, host, path] = scp as unknown as [string, string, string];
  else {
    try {
      const u = new URL(remote);
      if (!["https:", "http:", "ssh:", "git:"].includes(u.protocol)) return null;
      host = u.hostname;
      path = u.pathname;
    } catch {
      return null;
    }
  }
  // An SSH alias or a drive letter isn't a host anyone can open.
  if (!host.includes(".")) return null;
  const name = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
  if (!/^[^/]+\/.+/.test(name)) return null;
  return { host, name, url: `https://${host}/${name}` };
}

const segments = (path: string) => path.split("/").filter(Boolean).map(encodeURIComponent).join("/");

/** Where a folder at a branch and a commit are shown on the remote's site. */
function remotePages(web: { host: string; url: string }, branch: string, folder: string) {
  const gitlab = web.host.includes("gitlab");
  const bitbucket = web.host.includes("bitbucket");
  const gitea = web.host.includes("codeberg") || web.host.includes("gitea");
  const tree = gitlab ? "-/tree" : bitbucket ? "src" : gitea ? "src/branch" : "tree";
  const at = branch && folder ? `${web.url}/${tree}/${segments(branch)}/${segments(folder)}` : web.url;
  const commit = gitlab ? `${web.url}/-/commit` : bitbucket ? `${web.url}/commits` : `${web.url}/commit`;
  return { folderUrl: at, commitUrl: commit };
}

const infoCache = new Map<string, { at: number; info: Promise<GitInfo> }>();
/** How long the badge's answer is kept; a commit (`.git` changing) drops it sooner. */
const INFO_TTL = 15_000;

/** The home page's badge: is the wiki in git, on which branch, where online, and how many files changed. */
export function gitInfo(root: string, now = Date.now()): Promise<GitInfo> {
  const hit = infoCache.get(root);
  if (hit && now - hit.at < INFO_TTL) return hit.info;
  const info = readInfo(root);
  infoCache.set(root, { at: now, info });
  return info;
}

/** Forgets what's known about a wiki's git, after its `.git` changed. */
export const forgetGit = (root?: string) => (root ? infoCache.delete(root) : infoCache.clear());

async function readInfo(root: string): Promise<GitInfo> {
  const repo = await repoOf(root);
  if (!repo) return { repo: false };
  const [branch, remotes, status] = await Promise.all([
    tryGit(root, "symbolic-ref", "--short", "-q", "HEAD"),
    tryGit(root, "remote"),
    tryGit(root, "status", "--porcelain", "--", "."),
  ]);
  const names = (remotes ?? "").split("\n").filter(Boolean);
  const name = names.includes("origin") ? "origin" : names[0];
  const url = name ? (await tryGit(root, "remote", "get-url", name))?.trim() : undefined;
  const web = url ? webOf(url) : null;
  const folder = repo.prefix.replace(/\/$/, "");
  const b = branch?.trim() ?? "";
  return {
    repo: true,
    ...(b ? { branch: b } : {}),
    folder,
    changes: (status ?? "").split("\n").filter(Boolean).length,
    ...(web ? { remote: { name: web.name, host: web.host, url: web.url, ...remotePages(web, b, folder) } } : {}),
  };
}

const SEP = "\x1f";
const RECORD = "\x1e";

/**
 * When each file under `dir` was last committed (`pages/plan.md`, from the wiki root → ISO time), for the time a page
 * was updated: a clone or a pull gives every file the same time on disk, its commit doesn't. Files with changes not
 * committed, files never committed and wikis not in git (or ignored by the repo they sit in) aren't listed; their time
 * is the file's. Three git calls a wiki, however many pages it has.
 */
export function committedTimes(root: string, dir = "pages/"): Map<string, string> {
  const times = new Map<string, number>();
  // Paths in git's answers are from the repo's top; the wiki's folder is `prefix` there.
  const prefix = gitNow(root, "rev-parse", "--show-prefix")?.trim();
  if (prefix === undefined) return new Map();
  const ours = (file: string) => (file.startsWith(prefix) ? file.slice(prefix.length) : null);
  const log = gitNow(root, "log", "-z", "--no-color", `--format=${RECORD}%cI`, "--name-only", "--", dir) ?? "";
  for (const record of log.split(RECORD).slice(1)) {
    // The commit's time, then the files it changed: `date\0\npath\0path\0`.
    const [date = "", ...files] = record.split("\0");
    const at = Date.parse(date);
    if (Number.isNaN(at)) continue;
    for (const file of files) {
      const rel = ours(file.replace(/^\n/, ""));
      if (rel && at > (times.get(rel) ?? Number.NEGATIVE_INFINITY)) times.set(rel, at);
    }
  }
  if (!times.size) return new Map();
  // `XY path\0`, with a rename's old path after it. Untracked files count: a file deleted in a commit and made again
  // isn't that commit's.
  const status = gitNow(root, "status", "--porcelain", "-z", "--untracked-files=all", "--", dir);
  if (status === null) return new Map();
  const entries = status.split("\0");
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    if (/[RC]/.test(entry.slice(0, 2))) i++;
    const rel = ours(entry.slice(3));
    if (rel) times.delete(rel);
  }
  return new Map([...times].map(([file, at]) => [file, new Date(at).toISOString()]));
}

/** A version of a page as git knows it, with the file's path in the repo at that commit (never sent). */
interface Version extends PageVersion {
  path: string;
}

/** `pages/{a => b}/x.md` or `old.md => new.md` (git's numstat for a rename) → the new path. */
export function renamedTo(path: string): string {
  const brace = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(path);
  if (brace) return `${brace[1]}${brace[3]}${brace[4]}`.replace(/\/\/+/g, "/");
  const arrow = path.split(" => ");
  return arrow.length === 2 ? arrow[1] : path;
}

/** The page's commits, newest first, following it through renames. */
async function versionsOf(root: string, file: string, limit: number): Promise<Version[]> {
  const out = await tryGit(
    root,
    "log",
    "--follow",
    "-M",
    "--no-color",
    `-n${limit}`,
    `--format=${RECORD}%H${SEP}%h${SEP}%aI${SEP}%an${SEP}%s`,
    "--numstat",
    "--",
    file,
  );
  if (!out) return [];
  const versions: Version[] = [];
  for (const record of out.split(RECORD).slice(1)) {
    const [head = "", ...rest] = record.split("\n");
    const [hash, short, date, author, subject] = head.split(SEP);
    const stat = rest.filter(Boolean).at(-1)?.split("\t");
    if (!hash || !stat || stat.length < 3) continue;
    const num = (s: string) => (s === "-" ? 0 : Number(s) || 0);
    versions.push({
      hash,
      short,
      date,
      author,
      subject,
      added: num(stat[0]),
      removed: num(stat[1]),
      path: renamedTo(stat.slice(2).join("\t")),
    });
  }
  return versions;
}

/** How many versions the history lists. */
export const HISTORY_LIMIT = 200;

export interface History extends PageHistory {
  versions: Version[];
}

/** A page file's history (`file` from the wiki root): its versions, and whether the file has changes not committed. */
export async function pageHistory(root: string, file: string): Promise<History> {
  const repo = await repoOf(root);
  if (!repo) return { git: false, tracked: false, uncommitted: false, versions: [], more: false };
  const [listed, status] = await Promise.all([
    versionsOf(root, file, HISTORY_LIMIT + 1),
    tryGit(root, "status", "--porcelain", "--", file),
  ]);
  const versions = listed.slice(0, HISTORY_LIMIT);
  return {
    git: true,
    tracked: versions.length > 0,
    // Changed since its last commit, or never committed at all.
    uncommitted: (status ?? "").trim() !== "",
    versions,
    more: listed.length > HISTORY_LIMIT,
  };
}

/** What a file said at a version, or "" when that commit doesn't have it. */
export async function fileAt(root: string, version: Pick<Version, "hash" | "path">): Promise<string> {
  return (await tryGit(root, "cat-file", "-p", `${version.hash}:${version.path}`)) ?? "";
}

/** The page's text just before `version`: the version under it in the history, or nothing when it was made then. */
export async function before(root: string, history: History, at: number): Promise<string> {
  const older = history.versions[at + 1];
  if (older) return fileAt(root, older);
  // Past the listed history: the same path in the commit's parent, if it was there.
  const v = history.versions[at];
  return history.more && v ? ((await tryGit(root, "cat-file", "-p", `${v.hash}^:${v.path}`)) ?? "") : "";
}

/** A version's id in a URL: its full hash, or `working` for the file as it is, not committed. */
export const VERSION_ID = /^([0-9a-f]{40}|[0-9a-f]{64}|working)$/;

/** Only what browsers get: never the paths in the repo. */
export const publicHistory = (h: History): PageHistory => ({
  ...h,
  versions: h.versions.map(({ path: _, ...v }) => v),
});

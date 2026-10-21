// `pnpm wiki <command>`: how agents create wikis, check them and answer comments.
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { listAnswers } from "../server/answers.ts";
import { importData, readBackup, writeBackup } from "../server/backup.ts";
import { buildCorpus } from "../server/corpus.ts";
import { listPages, renderPage } from "../server/pages.ts";
import { APP_ROOT, slashes } from "../server/paths.ts";
import { discover, loadWiki, readLinks, type Wiki, writeLinks } from "../server/registry.ts";
import { copyTemplate } from "../server/template.ts";
import { addMessage, closeAll, getThread, listThreads, setStatus, waitingForAgent } from "../server/threads.ts";
import type { Answer, PageData, Question, Thread } from "../shared/api.ts";
import { isPageComment } from "../shared/quote.ts";
import { wikiIdSchema } from "../shared/schema.ts";

const HELP = `Shiori wiki CLI

  pnpm wiki list                                   Wikis, where they live and their open comments
  pnpm wiki new <id> [--title "T"] [--tagline "…"] [--at <folder>] [--accent "#rrggbb"]
                                                   New wiki from wikis/_template (--at: outside the app, linked)
  pnpm wiki link <folder>                          Show a wiki that lives elsewhere (wikis.local.json)
  pnpm wiki unlink <id|folder>                     Stop showing a linked wiki (its files stay)
  pnpm wiki check [id]                             Validate wiki.json, theme.json, pages, links, files, elements
  pnpm wiki inbox [id]                             Open comments and answers to open questions, waiting for an agent
  pnpm wiki threads <id> [--all]                   All open (or all) threads of a wiki
  pnpm wiki reply <id> <thread> "message"          Answer or ask back; the thread stays open
  pnpm wiki resolve <id> <thread> [--note "…"] [--wontfix]
  pnpm wiki reopen <id> <thread>
  pnpm wiki backup [id]                            Save comments and answers to <wiki>/backup.json (commit it)
  pnpm wiki restore <id> [--replace]               Load <wiki>/backup.json back into the wiki's database`;

const ACCENTS = ["#e8b86d", "#7fb7a4", "#8fa8e8", "#e0846b", "#c49be0", "#d4c46a", "#6fb3d4", "#e08aa8"];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: "string" },
    tagline: { type: "string" },
    at: { type: "string" },
    accent: { type: "string" },
    note: { type: "string" },
    wontfix: { type: "boolean", default: false },
    all: { type: "boolean", default: false },
    replace: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
const [command, ...args] = positionals;

function fail(message: string): never {
  console.error(message);
  closeAll();
  process.exit(1);
}

function wikiById(id: string | undefined): Wiki {
  if (!id) fail("Give a wiki id. `pnpm wiki list` shows them.");
  const w = discover(APP_ROOT).wikis.find((x) => x.id === id);
  return w ?? fail(`No wiki "${id}". \`pnpm wiki list\` shows them.`);
}

function threadId(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fail("Give a thread number, as shown by `pnpm wiki inbox`.");
}

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/\s+/g, " ");

function printThread(wiki: Wiki, t: Thread) {
  console.log(`\n#${t.id} [${t.status}] ${wiki.id} › ${t.page || "(home)"}  pages/${t.page || "index"}.md`);
  if (isPageComment(t.quote)) console.log("  on:    the whole page");
  else console.log(`  quote: …${short(t.quote.prefix, 32)}«${t.quote.exact}»${short(t.quote.suffix, 32)}…`);
  for (const m of t.messages)
    console.log(`  ${m.author === "user" ? "user " : "agent"}: ${m.body.replace(/\n/g, "\n         ")}`);
}

/** Answers to questions their page still has open, grouped by question. Resolving the question clears them. */
function openAnswers(wiki: Wiki): { page: PageData; question: Question; answers: Answer[] }[] {
  const answers = listAnswers(wiki.root);
  if (!answers.length) return [];
  const corpus = buildCorpus(wiki, listPages(wiki));
  const groups = new Map<string, { page: PageData; question: Question; answers: Answer[] }>();
  for (const a of answers) {
    const page = corpus.pages.get(a.page);
    const question = page?.questions.find((q) => q.id === a.question);
    if (!page || !question || question.status !== "open") continue;
    const key = `${a.page}#${a.question}`;
    if (!groups.has(key)) groups.set(key, { page, question, answers: [] });
    groups.get(key)?.answers.push(a);
  }
  return [...groups.values()];
}

function printAnswers(wiki: Wiki, { page, question, answers }: ReturnType<typeof openAnswers>[number]) {
  console.log(`
? ${wiki.id} › ${page.path || "(home)"}  ${page.file}  questions: ${question.id}`);
  console.log(`  question: ${question.text}${question.options.length ? `  [${question.options.join(" / ")}]` : ""}`);
  for (const a of answers) {
    const when = a.createdAt.slice(0, 16).replace("T", " ");
    console.log(`  answer:   ${[a.choice && `«${a.choice}»`, a.body].filter(Boolean).join(" ")}  (${when})`);
  }
}

const commands: Record<string, () => void> = {
  list() {
    const { wikis, broken } = discover(APP_ROOT);
    if (!wikis.length && !broken.length) console.log("No wikis yet. Make one with `pnpm wiki new <id>`.");
    for (const w of wikis) {
      const open = listThreads(w.root, { status: "open" });
      const waiting = waitingForAgent(open).length;
      console.log(
        `${w.id.padEnd(22)} ${w.manifest.title.padEnd(26)} ${String(waiting).padStart(2)} waiting / ${open.length} open   ${slashes(w.root)}${w.source === "linked" ? "  (linked)" : ""}`,
      );
    }
    for (const b of broken) console.log(`(broken) ${slashes(b.root)}: ${b.problems.join("; ")}`);
  },

  new() {
    const id = args[0];
    const valid = wikiIdSchema.safeParse(id);
    if (!valid.success) fail(`Bad id "${id ?? ""}": ${valid.error.issues[0].message}.`);
    if (discover(APP_ROOT).wikis.some((w) => w.id === id)) fail(`A wiki "${id}" already exists.`);
    const dest = values.at ? resolve(values.at) : join(APP_ROOT, "wikis", id);
    if (existsSync(dest) && readdirSync(dest).length) fail(`${slashes(dest)} isn't empty.`);
    const accent = values.accent ?? ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
    if (!/^#[0-9a-fA-F]{6}$/.test(accent)) fail("--accent must be #rrggbb.");
    const title = values.title ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    copyTemplate(APP_ROOT, dest, { id, title, tagline: values.tagline ?? "", accent, shiori: APP_ROOT });
    if (values.at) writeLinks(APP_ROOT, [...readLinks(APP_ROOT), dest]);
    console.log(
      `Created ${slashes(dest)}${values.at ? " and linked it" : ""}. Write pages in pages/, then run \`pnpm wiki check ${id}\`.`,
    );
  },

  link() {
    if (!args[0]) fail("Give the wiki folder.");
    const root = resolve(args[0]);
    const w = loadWiki(root, "linked");
    if (!("id" in w)) fail(`${slashes(root)} isn't a Shiori wiki: ${w.problems.join("; ")}`);
    if (discover(APP_ROOT).wikis.some((x) => x.id === w.id && resolve(x.root) !== root))
      fail(`A wiki "${w.id}" already exists.`);
    writeLinks(APP_ROOT, [...readLinks(APP_ROOT), root]);
    console.log(`Linked "${w.id}" from ${slashes(root)}.`);
  },

  unlink() {
    const target = args[0] ?? fail("Give the wiki id or folder.");
    const byId = discover(APP_ROOT).wikis.find((w) => w.id === target && w.source === "linked");
    const root = byId ? resolve(byId.root) : resolve(target);
    const linked = readLinks(APP_ROOT);
    const rest = linked.filter((p) => resolve(APP_ROOT, p) !== root);
    if (rest.length === linked.length) fail(`"${target}" isn't linked.`);
    writeLinks(APP_ROOT, rest);
    console.log(`Unlinked ${slashes(root)}. Its files are untouched.`);
  },

  check() {
    const { wikis, broken } = discover(APP_ROOT);
    const targets = args[0] ? [wikiById(args[0])] : wikis;
    let count = 0;
    for (const w of targets) {
      const problems = [...w.problems];
      const pages = listPages(w);
      if (!pages.some((p) => p.path === "")) problems.push("pages/index.md (the home page) is missing");
      for (const p of pages)
        for (const msg of renderPage(w, pages, p.path)?.problems ?? []) problems.push(`${p.file} ${msg}`);
      count += problems.length;
      console.log(`${problems.length ? "✗" : "✓"} ${w.id} (${pages.length} page${pages.length === 1 ? "" : "s"})`);
      for (const msg of problems) console.log(`    ${msg}`);
    }
    if (!args[0])
      for (const b of broken) {
        count += 1;
        console.log(`✗ ${slashes(b.root)}: ${b.problems.join("; ")}`);
      }
    if (count) fail(`${count} problem${count === 1 ? "" : "s"}.`);
  },

  inbox() {
    const targets = args[0] ? [wikiById(args[0])] : discover(APP_ROOT).wikis;
    let n = 0;
    let q = 0;
    for (const w of targets) {
      for (const t of waitingForAgent(listThreads(w.root, { status: "open" }))) {
        printThread(w, t);
        n++;
      }
      for (const group of openAnswers(w)) {
        printAnswers(w, group);
        q++;
      }
    }
    if (!n && !q) console.log("Inbox empty.");
    if (n)
      console.log(
        `\n${n} thread${n === 1 ? "" : "s"} waiting. Answer with \`pnpm wiki reply\` or \`pnpm wiki resolve\`.`,
      );
    if (q) {
      console.log(
        `\n${q} question${q === 1 ? "" : "s"} answered. Decide, then write it into the page's frontmatter:` +
          " that question's `status: resolved` and `answer: …`.",
      );
    }
  },

  threads() {
    const w = wikiById(args[0]);
    const threads = listThreads(w.root, values.all ? {} : { status: "open" });
    for (const t of threads) printThread(w, t);
    if (!threads.length) console.log(values.all ? "No threads." : "No open threads.");
  },

  reply() {
    const w = wikiById(args[0]);
    const id = threadId(args[1]);
    const body = args.slice(2).join(" ").trim() || fail("Give the message.");
    if (!addMessage(w.root, id, "agent", body)) fail(`No thread #${id} in ${w.id}.`);
    console.log(`Replied to #${id}.`);
  },

  resolve() {
    const w = wikiById(args[0]);
    const id = threadId(args[1]);
    if (!getThread(w.root, id)) fail(`No thread #${id} in ${w.id}.`);
    if (values.note) addMessage(w.root, id, "agent", values.note);
    setStatus(w.root, id, values.wontfix ? "wontfix" : "resolved");
    console.log(`#${id} ${values.wontfix ? "closed as won't fix" : "resolved"}.`);
  },

  backup() {
    const targets = args[0] ? [wikiById(args[0])] : discover(APP_ROOT).wikis;
    for (const w of targets) {
      const { file, threads, answers } = writeBackup(w.root);
      console.log(
        `${w.id}: ${threads} thread${threads === 1 ? "" : "s"}, ${answers} answer${answers === 1 ? "" : "s"} → ${slashes(file)}`,
      );
    }
    if (!targets.length) console.log("No wikis to back up.");
  },

  restore() {
    const w = wikiById(args[0]);
    try {
      const { threads, answers } = importData(w.root, readBackup(w.root), { replace: values.replace });
      console.log(
        `${w.id}: restored ${threads} thread${threads === 1 ? "" : "s"} and ${answers} answer${answers === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      fail((error as Error).message);
    }
  },

  reopen() {
    const w = wikiById(args[0]);
    const id = threadId(args[1]);
    if (!setStatus(w.root, id, "open")) fail(`No thread #${id} in ${w.id}.`);
    console.log(`#${id} reopened.`);
  },
};

if (values.help || !command || !commands[command]) {
  console.log(HELP);
  process.exit(command && !values.help ? 1 : 0);
}
commands[command]();
closeAll();

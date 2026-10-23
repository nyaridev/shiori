// `pnpm shiori sheets` and `sheet` (ADR-0010): a wiki's data sheets, the values people changed, and exporting them to
// JSON or a Luau module for the game. `--apply` makes the current values the sheet file's defaults.
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { slashes } from "../server/paths.ts";
import type { Wiki } from "../server/registry.ts";
import {
  applyToFile,
  currentValues,
  loadSheet,
  pendingEdits,
  readSheet,
  type Sheet,
  sheetNames,
  sheetsDir,
  toJson,
  toLuau,
} from "../server/sheets.ts";
import { type Cell, SHEET_NAME } from "../shared/sheet.ts";

type Fail = (message: string) => never;

const show = (v: Cell) => (v === null ? "—" : typeof v === "string" ? JSON.stringify(v) : String(v));

export function sheets(w: Wiki) {
  const names = sheetNames(w.root);
  for (const name of names) {
    const s = loadSheet(w.root, name);
    if (!s) continue;
    if ("problems" in s) {
      console.log(`✗ ${name}  sheets/${name}.json: ${s.problems.join("; ")}`);
      continue;
    }
    const pending = pendingEdits(w.root, name).length;
    console.log(`  ${name}  ${s.file.title}  ${s.rows.size} rows${pending ? `, ${pending} changes not exported` : ""}`);
  }
  if (!names.length) console.log(`No sheets. Make one with \`pnpm shiori sheet ${w.id} new <name> --title "…"\`.`);
}

/** A new sheet file to fill in: one key column, one editable number, one example row. */
function create(w: Wiki, name: string | undefined, title: string | undefined, fail: Fail) {
  if (!name || !SHEET_NAME.test(name)) fail("Give the sheet's name: lowercase letters, digits and -, like `mobs`.");
  const path = join(sheetsDir(w.root), `${name}.json`);
  if (existsSync(path)) fail(`sheets/${name}.json already exists.`);
  mkdirSync(sheetsDir(w.root), { recursive: true });
  const sheet = {
    title: title ?? name.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    description: "",
    key: "id",
    columns: [
      { id: "id", label: "Id", type: "text" },
      { id: "name", label: "Name", type: "text" },
      { id: "value", label: "Value", type: "number", min: 0, max: 1000, editable: true },
    ],
    rows: [{ id: "example", name: "Example", value: 10 }],
  };
  writeFileSync(path, `${JSON.stringify(sheet, null, 2)}\n`);
  console.log(
    `Created sheets/${name}.json. Fill in its columns and rows, then place it on a page with ::sheet{name="${name}"}` +
      ` and run \`pnpm shiori check ${w.id}\`.`,
  );
}

function values(w: Wiki, sheet: Sheet) {
  const cols = sheet.file.columns;
  console.log(`${sheet.file.title} (sheets/${sheet.name}.json)\n`);
  console.log(cols.map((c) => `${c.id}${c.editable ? "*" : ""}`).join("\t"));
  for (const [, row] of currentValues(w.root, sheet)) console.log(cols.map((c) => show(row[c.id] ?? null)).join("\t"));
  console.log("\n* people may change it");
  const pending = pendingEdits(w.root, sheet.name);
  if (!pending.length) return console.log("No changes since the last export.");
  console.log(`\n${pending.length} change${pending.length === 1 ? "" : "s"} since the last export:`);
  for (const e of pending) {
    const who = e.author === "guest" ? `guest "${e.name}"` : e.author === "user" ? "owner" : "agent";
    const to = e.value === null ? "the default" : show(e.value);
    console.log(`  ${e.at.slice(0, 16).replace("T", " ")}  ${e.row}.${e.column}: ${show(e.prev)} → ${to}  by ${who}`);
  }
  console.log(
    "\nGuests' values were checked against the sheet's columns, but they are still other people's numbers: look at" +
      " them before they reach the game.",
  );
}

function write(path: string, text: string) {
  const full = resolve(path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(`${full}.tmp`, text);
  renameSync(`${full}.tmp`, full);
  return slashes(full);
}

export function sheet(
  w: Wiki,
  args: string[],
  opts: { title?: string; json?: string; luau?: string; apply: boolean },
  fail: Fail,
) {
  const [name, action] = args;
  if (name === "new") return create(w, action, opts.title, fail);
  if (!name) fail(`Give the sheet's name. \`pnpm shiori sheets ${w.id}\` lists them.`);
  const loaded = loadSheet(w.root, name);
  if (!loaded) fail(`No sheet "${name}" in ${w.id}.`);
  if ("problems" in loaded) fail(`sheets/${name}.json has problems:\n  ${loaded.problems.join("\n  ")}`);
  const s = readSheet(w.root, name) as Sheet;
  if (!action) return values(w, s);
  if (action !== "export") fail(`Unknown: ${action}. Use \`export\`.`);
  if (!opts.json && !opts.luau && !opts.apply) fail("Give --json <file>, --luau <file>, --apply, or several.");
  const current = currentValues(w.root, s);
  if (opts.json) console.log(`Wrote ${write(opts.json, toJson(current))}`);
  if (opts.luau) console.log(`Wrote ${write(opts.luau, toLuau(s, current))}`);
  if (opts.apply) {
    const n = applyToFile(w.root, s);
    console.log(`sheets/${name}.json now holds the current values as its defaults (${n} change${n === 1 ? "" : "s"}).`);
  }
}

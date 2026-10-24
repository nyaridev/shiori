// `pnpm shiori forms` (ADR-0015): what the owner wrote in pages' forms, for the agent to turn into pages. Without a
// page, the forms and which pages have something new; with one, everything written in its forms, pictures as paths;
// `read` marks a page's forms as read once the agent has used them.
import { join } from "node:path";
import { attachmentsDir } from "../server/attachments.ts";
import { filledForms, loadForms, markFormsRead, pageForms, unread } from "../server/forms.ts";
import { listPages } from "../server/pages.ts";
import { slashes } from "../server/paths.ts";
import type { Wiki } from "../server/registry.ts";
import {
  type FieldValue,
  type FormEntry,
  type FormField,
  type FormPicture,
  formApplies,
  type PageForm,
} from "../shared/form.ts";

type Fail = (message: string) => never;

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};

const indent = (text: string, by: string) =>
  text
    .split(/\r?\n/)
    .map((line) => (line ? `${by}${line}` : ""))
    .join("\n");

/** A value as text: pictures as their files, a list as numbered entries. */
function show(w: Wiki, field: FormField | undefined, value: FieldValue, by: string): string {
  if (value === null) return `${by}—`;
  if (typeof value === "boolean") return `${by}${value ? "yes" : "no"}`;
  if (typeof value === "number")
    return `${by}${value}${field?.type === "number" && field.unit ? ` ${field.unit}` : ""}`;
  if (typeof value === "string") return indent(value, by);
  if (!value.length) return `${by}—`;
  const first = value[0];
  if (typeof first === "string") return `${by}${(value as string[]).join(", ")}`;
  if (typeof first === "object" && "file" in first)
    return (value as FormPicture[])
      .map((p) => `${by}${slashes(join(attachmentsDir(w.root), p.file))}${p.caption ? `  (${p.caption})` : ""}`)
      .join("\n");
  const list = field?.type === "list" ? field : undefined;
  return (value as FormEntry[])
    .map((entry, i) => {
      const lines = Object.entries(entry.values)
        .filter(([, v]) => v !== null && v !== "")
        .map(([id, v]) => {
          const sub = list?.fields[id];
          const text = show(w, sub, v, `${by}     `).trimStart();
          return `${by}   ${sub?.label ?? id}: ${text.includes("\n") ? `\n${show(w, sub, v, `${by}     `)}` : text}`;
        });
      // Named by its first one-line field, when it has one.
      const name = Object.entries(list?.fields ?? {}).find(([, f]) => f.type === "line")?.[0];
      const title = name && typeof entry.values[name] === "string" ? entry.values[name] : "";
      return [`${by}${i + 1}. ${title || list?.item || "Entry"}`, ...lines].join("\n");
    })
    .join("\n");
}

function printForm(w: Wiki, f: PageForm) {
  const state = !f.applies ? " — no longer on this page (kept)" : unread(f) ? " — new since read" : "";
  console.log(`\n## ${f.form?.title ?? f.name}  (forms/${f.name}.json)${state}`);
  if (f.problems) console.log(`   ✗ the file has problems: ${f.problems.join("; ")}`);
  if (f.updatedAt) console.log(`   Changed ${ago(f.updatedAt)}${f.readAt ? `, read ${ago(f.readAt)}` : ""}`);
  if (!f.values.length) return console.log("   Nothing written yet.");
  const order = f.form ? Object.keys(f.form.fields) : [];
  const sorted = [...f.values].sort((a, b) => {
    const ia = order.indexOf(a.field);
    const ib = order.indexOf(b.field);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  for (const v of sorted) {
    const field = f.form && Object.hasOwn(f.form.fields, v.field) ? f.form.fields[v.field] : undefined;
    console.log(`\n${field?.label ?? v.field}${field ? "" : " (not in the form any more)"}:`);
    console.log(show(w, field, v.value, "   "));
  }
}

export function forms(w: Wiki, args: string[], fail: Fail) {
  const pages = listPages(w);
  const pageOf = (raw: string | undefined) => {
    const path = (raw ?? "").replace(/^\/+|\/+$|\.md$/g, "");
    const page = pages.find((p) => p.path === path);
    if (!page) fail(`No page "${raw ?? ""}" in ${w.id}.`);
    return page;
  };

  if (args[0] === "read") {
    const page = pageOf(args[1]);
    const n = markFormsRead(w.root, page.path, args[2]);
    return console.log(
      n
        ? `Marked ${n} form${n === 1 ? "" : "s"} of ${page.path} as read.`
        : `${page.path} has nothing written in its forms.`,
    );
  }

  if (args[0]) {
    const page = pageOf(args[0]);
    const all = pageForms(w.root, page).filter((f) => !args[1] || f.name === args[1]);
    if (!all.length)
      return console.log(args[1] ? `${page.path} has no form "${args[1]}".` : `${page.path} has no forms.`);
    console.log(`# ${page.title}  (${page.file})`);
    for (const f of all) printForm(w, f);
    console.log(
      `\nWhen the page says what's here, mark it read: \`pnpm shiori forms ${w.id} read ${page.path}\`.` +
        " Never write in the forms: they're the owner's.",
    );
    return;
  }

  const { forms: loaded, broken } = loadForms(w.root);
  if (!loaded.size && !broken.size) {
    console.log("No forms. Add one in forms/<name>.json (the wiki's AGENTS.md → Page forms).");
    return;
  }
  console.log("Forms:");
  for (const [name, form] of loaded) {
    const on = pages.filter((p) => formApplies(form, p)).length;
    console.log(
      `  ${name}  ${form.title}  on ${on} page${on === 1 ? "" : "s"}  (${[...form.pages, ...form.types.map((t) => `type: ${t}`)].join(", ")})`,
    );
  }
  for (const [name, why] of broken) console.log(`✗ ${name}  forms/${name}.json: ${why.join("; ")}`);

  const filled = filledForms(w.root);
  const fresh = filled.filter(unread);
  console.log(fresh.length ? "\nNew since the agent read them:" : "\nNothing new since the agent last read the forms.");
  for (const f of fresh)
    console.log(
      `  ${f.page}  ${loaded.get(f.form)?.title ?? f.form}  ${f.filled} field${f.filled === 1 ? "" : "s"}, changed ${ago(f.updatedAt)}`,
    );
  const read = filled.length - fresh.length;
  if (read) console.log(`  (${read} more read already)`);
  if (fresh.length) console.log(`\nRead one with \`pnpm shiori forms ${w.id} <page>\`.`);
}

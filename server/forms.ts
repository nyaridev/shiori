// Page forms (ADR-0015): `forms/<name>.json`, written by agents, is read here and never written by the app. What the
// owner writes in a page's form is kept in `data/wiki.db` (`form_values`), one row per field, and the agent reads it
// with `pnpm shiori forms`. Forms are the owner's: the guest server has no route to them and the public wiki leaves
// them out.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  type FieldValue,
  FORM_LIMITS,
  FORM_NAME,
  type Form,
  type FormValueInfo,
  formApplies,
  formSchema,
  isEmpty,
  matchesPage,
  type PageForm,
  picturesIn,
  valueSchema,
} from "../shared/form.ts";
import { issues } from "../shared/schema.ts";
import { hasAttachment } from "./attachments.ts";
import { readJson } from "./paths.ts";
import { dbFor } from "./threads.ts";

type Db = ReturnType<typeof dbFor>;

export const formsDir = (root: string) => join(root, "forms");

export interface Forms {
  forms: Map<string, Form>;
  /** Files that aren't valid forms, with why. */
  broken: Map<string, string[]>;
}

/** The wiki's forms. Only its own: a form names the wiki's pages, so the template's would mean nothing here. */
export function loadForms(root: string): Forms {
  const out: Forms = { forms: new Map(), broken: new Map() };
  const dir = formsDir(root);
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const name = file.slice(0, -".json".length);
    const full = join(dir, file);
    if (!FORM_NAME.test(name)) {
      out.broken.set(name, ["name the file in lowercase letters, digits and dashes"]);
      continue;
    }
    if (statSync(full).size > FORM_LIMITS.bytes) {
      out.broken.set(name, ["the file is over 256 KB"]);
      continue;
    }
    const { value, error } = readJson(full);
    if (error) {
      out.broken.set(name, [error]);
      continue;
    }
    const parsed = formSchema.safeParse(value);
    if (parsed.success) out.forms.set(name, parsed.data);
    else out.broken.set(name, issues(parsed.error));
  }
  return out;
}

/** What `shiori check` says about a wiki's forms: broken files, and page patterns that take in no page. */
export function formProblems(root: string, pages: { path: string; type?: string }[]): string[] {
  const { forms, broken } = loadForms(root);
  const out = [...broken].flatMap(([name, why]) => why.map((w) => `forms/${name}.json: ${w}`));
  for (const [name, form] of forms) {
    for (const p of form.pages)
      if (!pages.some((page) => matchesPage(p, page.path)))
        out.push(`forms/${name}.json: pages: "${p}" takes in no page`);
    for (const t of form.types)
      if (!pages.some((page) => page.type === t)) out.push(`forms/${name}.json: types: no page has type "${t}"`);
  }
  return out;
}

interface ValueRow {
  form: string;
  field: string;
  value: string;
  updated_at: string;
}

const parse = (raw: string): FieldValue => {
  try {
    return JSON.parse(raw) as FieldValue;
  } catch {
    return null;
  }
};

/** A page's forms: the ones on it, and any other that has something written for it, in their tabs' order. */
export function pageForms(root: string, page: { path: string; type?: string }, loaded = loadForms(root)): PageForm[] {
  const db = dbFor(root);
  const rows = db
    .prepare("select form, field, value, updated_at from form_values where page = ? order by id")
    .all(page.path) as unknown as ValueRow[];
  const reads = new Map(
    (
      db.prepare("select form, read_at from form_reads where page = ?").all(page.path) as {
        form: string;
        read_at: string;
      }[]
    ).map((r) => [r.form, r.read_at]),
  );
  const names = new Set<string>();
  for (const [name, form] of loaded.forms) if (formApplies(form, page)) names.add(name);
  for (const r of rows) if (r.value !== "null") names.add(r.form);

  const out = [...names].map((name): PageForm => {
    const form = loaded.forms.get(name) ?? null;
    const own = rows.filter((r) => r.form === name);
    const values: FormValueInfo[] = own
      .filter((r) => r.value !== "null")
      .map((r) => ({ field: r.field, value: parse(r.value), updatedAt: r.updated_at }));
    const updatedAt = own.reduce<string | null>((a, r) => (a && a > r.updated_at ? a : r.updated_at), null);
    const problems = loaded.broken.get(name);
    return {
      name,
      form,
      applies: !!form && formApplies(form, page),
      values,
      readAt: reads.get(name) ?? null,
      updatedAt,
      ...(problems ? { problems } : {}),
    };
  });
  const order = (f: PageForm) => f.form?.order ?? 100;
  return out.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

export type SetFormValue =
  | { saved: FormValueInfo }
  | { error: string; status: 400 | 404 | 409 }
  | { unchanged: FormValueInfo | null };

/**
 * Writes one field of a page's form, checked against the field. The form must be on the page and have the field; its
 * pictures must be the wiki's attachments. An empty value is stored as null.
 */
export function setFormValue(
  root: string,
  page: { path: string; type?: string },
  name: string,
  field: string,
  raw: unknown,
  loaded = loadForms(root),
): SetFormValue {
  const form = loaded.forms.get(name);
  if (!form) return { error: "no such form", status: 404 };
  if (!formApplies(form, page)) return { error: "this form isn't on that page", status: 409 };
  const def = Object.hasOwn(form.fields, field) ? form.fields[field] : undefined;
  if (!def) return { error: "no such field", status: 404 };
  // Null clears any field.
  const parsed = raw === null ? ({ success: true, data: null } as const) : valueSchema(def).safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${def.label}: ${issue?.message ?? "not a value this field takes"}`, status: 400 };
  }
  if (!picturesIn(parsed.data).every((p) => hasAttachment(root, p.file)))
    return { error: "no such picture", status: 400 };

  const value = isEmpty(parsed.data) ? null : parsed.data;
  const json = JSON.stringify(value);
  const db = dbFor(root);
  const old = db
    .prepare("select value, updated_at from form_values where page = ? and form = ? and field = ?")
    .get(page.path, name, field) as { value: string; updated_at: string } | undefined;
  // Nothing new: no write, so the time it last changed stays true.
  if (old ? old.value === json : value === null)
    return { unchanged: old ? { field, value, updatedAt: old.updated_at } : null };
  const updatedAt = new Date().toISOString();
  db.prepare(
    `insert into form_values (page, form, field, value, updated_at) values (?, ?, ?, ?, ?)
     on conflict (page, form, field) do update set value = excluded.value, updated_at = excluded.updated_at`,
  ).run(page.path, name, field, json, updatedAt);
  return { saved: { field, value, updatedAt } };
}

/** The agent read a page's forms (or one of them): `pnpm shiori forms <id> read`. Answers how many it marked. */
export function markFormsRead(root: string, page: string, form?: string): number {
  const db = dbFor(root);
  const forms = (
    db.prepare("select distinct form from form_values where page = ?").all(page) as { form: string }[]
  ).map((r) => r.form);
  const at = new Date().toISOString();
  const mark = db.prepare(
    "insert into form_reads (page, form, read_at) values (?, ?, ?) on conflict (page, form) do update set read_at = excluded.read_at",
  );
  const marked = forms.filter((f) => !form || f === form);
  for (const f of marked) mark.run(page, f, at);
  return marked.length;
}

export interface FilledForm {
  page: string;
  form: string;
  /** Fields with something in them. */
  filled: number;
  updatedAt: string;
  readAt: string | null;
}

/** Every page's form that has been written in, the most recently changed first. */
export function filledForms(root: string): FilledForm[] {
  const rows = dbFor(root)
    .prepare(
      `select v.page, v.form, sum(v.value != 'null') as filled, max(v.updated_at) as updated_at, r.read_at
       from form_values v left join form_reads r on r.page = v.page and r.form = v.form
       group by v.page, v.form order by max(v.updated_at) desc`,
    )
    .all() as { page: string; form: string; filled: number; updated_at: string; read_at: string | null }[];
  return rows
    .filter((r) => r.filled > 0 || r.read_at)
    .map((r) => ({
      page: r.page,
      form: r.form,
      filled: Number(r.filled),
      updatedAt: r.updated_at,
      readAt: r.read_at,
    }));
}

/** Changed since the agent last read it. */
export const unread = (f: { updatedAt: string | null; readAt: string | null }) =>
  !!f.updatedAt && (!f.readAt || f.updatedAt > f.readAt);

/** A page moved (`shiori rename`): its forms' values and reads go with it. */
export function moveFormRows(db: Db, from: string, to: string, at: string): number {
  const moved = Number(
    db.prepare("update or replace form_values set page = ?, updated_at = ? where page = ?").run(to, at, from).changes,
  );
  db.prepare("update or replace form_reads set page = ? where page = ?").run(to, from);
  return moved;
}

// Backups and two PCs (backup.ts, sync.ts): rows join by page, form and field, and the newer change wins.

export interface FormValueRow {
  page: string;
  form: string;
  field: string;
  /** JSON. */
  value: string;
  updatedAt: string;
}
export interface FormReadRow {
  page: string;
  form: string;
  readAt: string;
}

export function allFormRows(root: string): { formValues: FormValueRow[]; formReads: FormReadRow[] } {
  const db = dbFor(root);
  const formValues = (
    db
      .prepare("select page, form, field, value, updated_at from form_values order by id")
      .all() as unknown as (ValueRow & { page: string })[]
  ).map((r) => ({ page: r.page, form: r.form, field: r.field, value: r.value, updatedAt: r.updated_at }));
  const formReads = (
    db.prepare("select page, form, read_at from form_reads order by page, form").all() as {
      page: string;
      form: string;
      read_at: string;
    }[]
  ).map((r) => ({ page: r.page, form: r.form, readAt: r.read_at }));
  return { formValues, formReads };
}

/** Adds rows this database doesn't have and takes newer ones; answers how many changed. Inside the caller's transaction. */
export function mergeFormRows(
  db: Db,
  values: FormValueRow[],
  reads: FormReadRow[],
): { added: number; updated: number } {
  let added = 0;
  let updated = 0;
  const find = db.prepare("select updated_at from form_values where page = ? and form = ? and field = ?");
  const put = db.prepare(
    `insert into form_values (page, form, field, value, updated_at) values (?, ?, ?, ?, ?)
     on conflict (page, form, field) do update set value = excluded.value, updated_at = excluded.updated_at`,
  );
  for (const v of values) {
    const local = find.get(v.page, v.form, v.field) as { updated_at: string } | undefined;
    if (local && local.updated_at >= v.updatedAt) continue;
    put.run(v.page, v.form, v.field, v.value, v.updatedAt);
    if (local) updated++;
    else added++;
  }
  const read = db.prepare(
    `insert into form_reads (page, form, read_at) values (?, ?, ?)
     on conflict (page, form) do update set read_at = max(read_at, excluded.read_at)`,
  );
  for (const r of reads) read.run(r.page, r.form, r.readAt);
  return { added, updated };
}

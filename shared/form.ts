// Page forms (ADR-0015): a wiki's `forms/<name>.json` adds a tab beside a page, where the owner fills in fields
// (lore, looks, abilities) for the agent to read. A form picks its pages by path or by type, so every character
// shares one form and creatures another. Like a layout, a form is data: fields from Shiori's set, placed in a grid of
// named areas. What people write is kept in the wiki's database, never in the page.
import { z } from "zod";
import { checkAreas } from "./layout.ts";

/** A form's file name, without `.json`. */
export const FORM_NAME = /^[a-z][a-z0-9-]{0,39}$/;

export const FORM_LIMITS = {
  /** Characters in a one-line field. */
  line: 300,
  /** Characters in a long text field. */
  text: 20_000,
  /** Entries in a list. */
  items: 100,
  /** Pictures in one field. */
  pictures: 24,
  /** Characters in a picture's caption. */
  caption: 200,
  /** Fields in a form. */
  fields: 60,
  /** Bytes of a form file. */
  bytes: 256 * 1024,
} as const;

/** A field's id: also its area name in the grid. Never a name every object already has (`constructor`). */
const fieldId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,23}$/, "use lowercase letters, digits and dashes")
  .refine((id) => !(id in Object.prototype), "pick another name");

const common = {
  /** Shown above the field. */
  label: z.string().min(1).max(60),
  /** A line under the label: what to write here. */
  hint: z.string().max(300).optional(),
  /** Shown in the empty field. */
  placeholder: z.string().max(120).optional(),
};

/** The fields a list's entries can have: every field but another list. */
const simpleFields = [
  /** One line of text: a name, a title, a place. */
  z.strictObject({ type: z.literal("line"), ...common }),
  /** Paragraphs: lore, a description, notes. */
  z.strictObject({ type: z.literal("text"), ...common, rows: z.number().int().min(2).max(30).default(6) }),
  z.strictObject({
    type: z.literal("number"),
    ...common,
    min: z.number().optional(),
    max: z.number().optional(),
    /** Shown after the number: "s", "HP", "m". */
    unit: z.string().min(1).max(20).optional(),
  }),
  /** One of a few options, or several with `multiple`. */
  z.strictObject({
    type: z.literal("choice"),
    ...common,
    options: z.array(z.string().min(1).max(60)).min(1).max(50),
    multiple: z.boolean().default(false),
  }),
  /** Yes or no; the label is the checkbox's text. */
  z.strictObject({ type: z.literal("check"), ...common }),
  /** Pictures people add (sketches, references), each with a caption. */
  z.strictObject({
    type: z.literal("pictures"),
    ...common,
    max: z.number().int().min(1).max(FORM_LIMITS.pictures).default(8),
  }),
] as const;

export const simpleFieldSchema = z.discriminatedUnion("type", [...simpleFields]);
export type SimpleField = z.infer<typeof simpleFieldSchema>;

/** Entries that repeat, each with the same fields: abilities, quests, drops. */
const listFieldSchema = z
  .strictObject({
    type: z.literal("list"),
    ...common,
    /** What one entry is called: "Ability". */
    item: z.string().min(1).max(40).optional(),
    fields: z.record(fieldId, simpleFieldSchema),
    /** How an entry's fields are placed, like the form's own areas; one under another without it. */
    areas: z.array(z.array(fieldId).min(1).max(4)).min(1).max(12).optional(),
  })
  .superRefine((list, ctx) => {
    const n = Object.keys(list.fields).length;
    if (n < 1 || n > 12) ctx.addIssue({ code: "custom", path: ["fields"], message: "give an entry 1 to 12 fields" });
    if (list.areas) checkAreas(list.areas, list.fields, ctx, { key: "fields", what: "field" });
  });

export const fieldSchema = z.union([simpleFieldSchema, listFieldSchema]);
export type ListField = z.infer<typeof listFieldSchema>;
export type FormField = SimpleField | ListField;
export type FieldType = FormField["type"];

/**
 * Which pages a form is on: a page's path (`world/characters/wren`), every page right under one (`world/characters/*`),
 * or every page below it, however deep (`world/creatures/**`).
 */
const pattern = z
  .string()
  .min(1)
  .max(200)
  .regex(/^(\*\*|[a-z0-9][a-z0-9._/-]*?(\/\*\*?)?)$/i, "a page's path, or a section's followed by /* or /**");

export const formSchema = z
  .strictObject({
    /** The tab's name: "Profile", "Lore". */
    title: z.string().min(1).max(40),
    /** A line at the top of the form: what it's for. */
    description: z.string().max(500).optional(),
    /** Where its tab goes among the page's forms: lower first. */
    order: z.number().int().min(-100).max(100).default(0),
    pages: z.array(pattern).max(50).default([]),
    /** Pages whose frontmatter `type` is one of these. */
    types: z.array(z.string().min(1).max(40)).max(20).default([]),
    /** Rows of field ids, like a layout's; without it, the fields go one under another. */
    areas: z.array(z.array(fieldId).min(1).max(4)).min(1).max(30).optional(),
    fields: z.record(fieldId, fieldSchema),
  })
  .superRefine((form, ctx) => {
    if (!form.pages.length && !form.types.length)
      ctx.addIssue({ code: "custom", path: ["pages"], message: "name its pages (pages) or their type (types)" });
    const n = Object.keys(form.fields).length;
    if (n < 1 || n > FORM_LIMITS.fields)
      ctx.addIssue({ code: "custom", path: ["fields"], message: `give the form 1 to ${FORM_LIMITS.fields} fields` });
    if (form.areas) checkAreas(form.areas, form.fields, ctx, { key: "fields", what: "field" });
  });
export type Form = z.infer<typeof formSchema>;

/** A form's or a list's rows of areas: its own, or each field on a row of its own. */
export const areasOf = (f: { areas?: string[][]; fields: Record<string, unknown> }): string[][] =>
  f.areas ?? Object.keys(f.fields).map((id) => [id]);

/** Whether a page pattern takes in a page. */
export function matchesPage(pattern: string, path: string): boolean {
  if (pattern === "**") return path !== "";
  if (pattern.endsWith("/**")) return path.startsWith(`${pattern.slice(0, -3)}/`);
  if (pattern.endsWith("/*")) {
    const base = `${pattern.slice(0, -2)}/`;
    return path.startsWith(base) && !path.slice(base.length).includes("/");
  }
  return pattern === path;
}

/** Whether a form is on a page, by its path or its type. */
export const formApplies = (form: Pick<Form, "pages" | "types">, page: { path: string; type?: string }) =>
  form.pages.some((p) => matchesPage(p, page.path)) || (!!page.type && form.types.includes(page.type));

// What people write. Every field's value is JSON; an empty one (null, "", [], false) is kept as null, so clearing a
// field reaches the wiki's other PCs too.

export interface FormPicture {
  /** A file in the wiki's `data/attachments/`. */
  file: string;
  caption: string;
}
/** A list's entry: an id of its own (so it keeps its place while edited), and its fields' values. */
export interface FormEntry {
  id: string;
  values: Record<string, FieldValue>;
}
export type FieldValue = string | number | boolean | string[] | FormPicture[] | FormEntry[] | null;

const ATTACHMENT = /^[0-9A-Z]{26}\.(png|jpg|webp|gif)$/;
const lineValue = z
  .string()
  .max(FORM_LIMITS.line)
  .transform((s) => s.replace(/[\r\n]+/g, " "));

/** The value a simple field takes, checked against the field. */
function simpleValue(field: SimpleField): z.ZodType<FieldValue> {
  switch (field.type) {
    case "line":
      return lineValue;
    case "text":
      return z.string().max(FORM_LIMITS.text);
    case "number":
      return z
        .number()
        .finite()
        .refine((n) => field.min === undefined || n >= field.min, `at least ${field.min}`)
        .refine((n) => field.max === undefined || n <= field.max, `at most ${field.max}`)
        .nullable();
    case "choice":
      return field.multiple
        ? z.array(z.enum(field.options as [string, ...string[]])).max(field.options.length)
        : z.enum(field.options as [string, ...string[]]).nullable();
    case "check":
      return z.boolean();
    case "pictures":
      return z
        .array(z.strictObject({ file: z.string().regex(ATTACHMENT), caption: z.string().max(FORM_LIMITS.caption) }))
        .max(field.max);
  }
}

/** The value a field takes. A list's entries keep only the fields the list has. */
export function valueSchema(field: FormField): z.ZodType<FieldValue> {
  if (field.type !== "list") return simpleValue(field);
  const entry = z.strictObject({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
    values: z.record(z.string(), z.unknown()),
  });
  return z
    .array(entry)
    .max(FORM_LIMITS.items)
    .transform((items, ctx): FormEntry[] =>
      items.map((item, i) => {
        const values: Record<string, FieldValue> = {};
        for (const [id, sub] of Object.entries(field.fields)) {
          if (!Object.hasOwn(item.values, id)) continue;
          const parsed = simpleValue(sub).safeParse(item.values[id]);
          if (parsed.success) values[id] = parsed.data;
          else ctx.addIssue({ code: "custom", path: [i, id], message: parsed.error.issues[0]?.message ?? "bad value" });
        }
        return { id: item.id, values };
      }),
    );
}

/** Whether a value says nothing: it's stored as null. */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === "") return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Every picture a value holds, in a picture field or a list's entries. */
export function picturesIn(value: unknown): FormPicture[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): FormPicture[] => {
    if (v && typeof v === "object" && "file" in v) return [v as FormPicture];
    if (v && typeof v === "object" && "values" in v)
      return Object.values((v as FormEntry).values).flatMap((x) => picturesIn(x));
    return [];
  });
}

/** One saved field of a page's form. */
export interface FormValueInfo {
  field: string;
  value: FieldValue;
  updatedAt: string;
}

/** A form as a page shows it: the form (null when its file is gone or broken) and what's been written in it. */
export interface PageForm {
  name: string;
  form: Form | null;
  /** The form is on this page. One that isn't any more (a renamed page, a changed file) still shows what was written. */
  applies: boolean;
  values: FormValueInfo[];
  /** When the agent last said it read this page's form (`pnpm shiori forms <id> read`). */
  readAt: string | null;
  /** The last change to any of its fields. */
  updatedAt: string | null;
  /** What's wrong with its file. */
  problems?: string[];
}

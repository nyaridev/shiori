import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formApplies, formSchema, matchesPage, valueSchema } from "../shared/form.ts";
import { exportData, importData } from "./backup.ts";
import {
  allFormRows,
  filledForms,
  formProblems,
  loadForms,
  markFormsRead,
  mergeFormRows,
  moveFormRows,
  pageForms,
  setFormValue,
  unread,
} from "./forms.ts";
import { closeAll, dbFor } from "./threads.ts";

let root: string;
const WREN = { path: "world/characters/wren", type: "character" };
const CHARACTER = {
  title: "Profile",
  pages: ["world/characters/*"],
  fields: {
    lore: { type: "text", label: "Lore" },
    role: { type: "choice", label: "Role", options: ["guide", "merchant"] },
    abilities: {
      type: "list",
      label: "Abilities",
      item: "Ability",
      fields: { name: { type: "line", label: "Name" }, cooldown: { type: "number", label: "Cooldown", min: 0 } },
    },
  },
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shiori-forms-"));
  mkdirSync(join(root, "forms"));
  writeFileSync(join(root, "forms", "character.json"), JSON.stringify(CHARACTER));
});
afterEach(() => {
  closeAll();
  rmSync(root, { recursive: true, force: true });
});

describe("a form's file", () => {
  it("names its pages by path, section or type", () => {
    expect(matchesPage("world/characters/*", "world/characters/wren")).toBe(true);
    expect(matchesPage("world/characters/*", "world/characters")).toBe(false);
    expect(matchesPage("world/characters/*", "world/characters/kin/ash")).toBe(false);
    expect(matchesPage("world/**", "world/characters/kin/ash")).toBe(true);
    expect(matchesPage("world/**", "worldly")).toBe(false);
    expect(matchesPage("plan", "plan")).toBe(true);
    expect(matchesPage("**", "")).toBe(false);
    const form = formSchema.parse({ ...CHARACTER, pages: [], types: ["creature"] });
    expect(formApplies(form, { path: "x", type: "creature" })).toBe(true);
    expect(formApplies(form, WREN)).toBe(false);
  });

  it("is checked: pages, fields and their grid", () => {
    expect(formSchema.safeParse({ title: "T", fields: { a: { type: "line", label: "A" } } }).success).toBe(false);
    expect(formSchema.safeParse({ title: "T", pages: ["x"], fields: {} }).success).toBe(false);
    expect(
      formSchema.safeParse({ title: "T", pages: ["x"], fields: { constructor: { type: "line", label: "A" } } }).success,
    ).toBe(false);
    const grid = { title: "T", pages: ["x"], fields: { a: { type: "line", label: "A" } } };
    expect(formSchema.safeParse({ ...grid, areas: [["a", "b"]] }).success).toBe(false);
    expect(formSchema.safeParse({ ...grid, areas: [["a", "a"]] }).success).toBe(true);
    expect(formSchema.safeParse({ ...grid, pages: ["../x"] }).success).toBe(false);
  });

  it("is reported by check when broken or taking in no page", () => {
    writeFileSync(join(root, "forms", "bad.json"), "{");
    writeFileSync(join(root, "forms", "Bad Name.json"), "{}");
    const problems = formProblems(root, [{ path: "plan" }]);
    expect(problems.some((p) => p.startsWith("forms/bad.json:"))).toBe(true);
    expect(problems.some((p) => p.startsWith("forms/Bad Name.json:"))).toBe(true);
    expect(problems).toContain('forms/character.json: pages: "world/characters/*" takes in no page');
    expect(loadForms(root).forms.has("character")).toBe(true);
  });
});

describe("values", () => {
  it("keep a list's entries to the list's fields", () => {
    const list = formSchema.parse(CHARACTER).fields.abilities;
    const parsed = valueSchema(list).safeParse([
      { id: "a1", values: { name: "Glow\nup", cooldown: 3, extra: "dropped" } },
    ]);
    expect(parsed.data).toEqual([{ id: "a1", values: { name: "Glow up", cooldown: 3 } }]);
    expect(valueSchema(list).safeParse([{ id: "a1", values: { cooldown: -1 } }]).success).toBe(false);
  });

  it("are saved per field; an empty one is kept as null, and nothing new isn't written", () => {
    const first = setFormValue(root, WREN, "character", "lore", "Keeps the lanterns.");
    expect("saved" in first).toBe(true);
    expect("unchanged" in setFormValue(root, WREN, "character", "lore", "Keeps the lanterns.")).toBe(true);
    expect("unchanged" in setFormValue(root, WREN, "character", "role", null)).toBe(true);
    expect(setFormValue(root, WREN, "character", "role", "king")).toMatchObject({ status: 400 });
    setFormValue(root, WREN, "character", "abilities", [{ id: "a", values: { name: "Glow" } }]);
    expect("saved" in setFormValue(root, WREN, "character", "abilities", null)).toBe(true);
    setFormValue(root, WREN, "character", "lore", "   ");
    const [form] = pageForms(root, WREN);
    expect(form.values).toEqual([]);
    expect(form.updatedAt).not.toBeNull();
    expect(allFormRows(root).formValues[0].value).toBe("null");
  });

  it("are read by the agent, and new again when changed", async () => {
    setFormValue(root, WREN, "character", "lore", "One");
    expect(filledForms(root).filter(unread)).toHaveLength(1);
    expect(markFormsRead(root, WREN.path)).toBe(1);
    expect(filledForms(root).filter(unread)).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 5));
    setFormValue(root, WREN, "character", "lore", "Two");
    expect(filledForms(root).filter(unread)).toHaveLength(1);
  });

  it("move with a renamed page", () => {
    setFormValue(root, WREN, "character", "lore", "Moves.");
    markFormsRead(root, WREN.path);
    moveFormRows(dbFor(root), WREN.path, "world/characters/wren-ash", new Date().toISOString());
    expect(pageForms(root, WREN)[0].values).toEqual([]);
    const moved = pageForms(root, { path: "world/characters/wren-ash" })[0];
    expect(moved.values[0].value).toBe("Moves.");
    expect(moved.readAt).not.toBeNull();
  });
});

describe("two PCs and backups", () => {
  it("merge field by field, the newer change winning", () => {
    setFormValue(root, WREN, "character", "lore", "Here");
    const db = dbFor(root);
    const merged = mergeFormRows(
      db,
      [
        { page: WREN.path, form: "character", field: "lore", value: '"Older"', updatedAt: "2000-01-01T00:00:00.000Z" },
        { page: WREN.path, form: "character", field: "role", value: '"guide"', updatedAt: "2000-01-01T00:00:00.000Z" },
      ],
      [{ page: WREN.path, form: "character", readAt: "2000-01-01T00:00:00.000Z" }],
    );
    expect(merged).toEqual({ added: 1, updated: 0 });
    const values = Object.fromEntries(pageForms(root, WREN)[0].values.map((v) => [v.field, v.value]));
    expect(values).toEqual({ lore: "Here", role: "guide" });
    mergeFormRows(
      db,
      [{ page: WREN.path, form: "character", field: "lore", value: '"Newer"', updatedAt: "2999-01-01T00:00:00.000Z" }],
      [],
    );
    expect(pageForms(root, WREN)[0].values.find((v) => v.field === "lore")?.value).toBe("Newer");
  });

  it("come back from a backup", () => {
    setFormValue(root, WREN, "character", "lore", "Backed up.");
    markFormsRead(root, WREN.path);
    const data = exportData(root);
    expect(data.formValues).toHaveLength(1);
    importData(root, data, { replace: true });
    const [form] = pageForms(root, WREN);
    expect(form.values[0].value).toBe("Backed up.");
    expect(form.readAt).toBe(data.formReads[0].readAt);
  });
});

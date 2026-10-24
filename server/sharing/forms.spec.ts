// Page forms (ADR-0015) through the servers: the owner reads a page's forms and writes their fields; the guest server
// has no route to them, on any kind of link.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { PageForm } from "../../shared/form.ts";
import { sharingFixture } from "./fixture.ts";

const s = sharingFixture();
const json = async <T>(res: Response) => (await res.json()) as T;

const PROFILE = {
  title: "Profile",
  pages: ["plan"],
  areas: [
    ["look", "age"],
    ["lore", "lore"],
  ],
  fields: {
    look: { type: "pictures", label: "Look", max: 2 },
    age: { type: "number", label: "Age", min: 0 },
    lore: { type: "text", label: "Lore" },
  },
};

function writeForm(name: string, form: unknown) {
  const dir = join(s.app, "wikis", "alpha", "forms");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(form));
}
const formsOf = async (page = "plan") =>
  (await json<{ forms: PageForm[] }>(await s.owner(`/api/wikis/alpha/forms?page=${page}`))).forms;
const put = (form: string, field: string, value: unknown, page = "plan") =>
  s.owner(`/api/wikis/alpha/forms/${form}`, { method: "PUT", body: { page, field, value } });

describe("the owner", () => {
  it("sees the forms on a page, and none on others", async () => {
    writeForm("profile", PROFILE);
    const forms = await formsOf();
    expect(forms.map((f) => [f.name, f.form?.title, f.applies])).toEqual([["profile", "Profile", true]]);
    expect(await formsOf("")).toEqual([]);
    expect((await s.owner("/api/wikis/alpha/forms?page=nope")).status).toBe(404);
  });

  it("writes fields, checked against the form", async () => {
    writeForm("profile", PROFILE);
    expect((await put("profile", "lore", "Born in the grove.")).status).toBe(200);
    expect((await put("profile", "age", 12)).status).toBe(200);
    expect((await put("profile", "age", -1)).status).toBe(400);
    expect((await put("profile", "age", "twelve")).status).toBe(400);
    expect((await put("profile", "missing", "x")).status).toBe(404);
    expect((await put("nothing", "lore", "x")).status).toBe(404);
    // A form that isn't on the page takes nothing there.
    expect((await put("profile", "lore", "x", "")).status).toBe(409);
    const [form] = await formsOf();
    expect(Object.fromEntries(form.values.map((v) => [v.field, v.value]))).toEqual({
      lore: "Born in the grove.",
      age: 12,
    });
  });

  it("adds only the wiki's own pictures", async () => {
    writeForm("profile", PROFILE);
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    const up = await s.owner("/api/wikis/alpha/attachments", { method: "POST", raw: png, type: "image/png" });
    const { file } = await json<{ file: string }>(up);
    expect((await put("profile", "look", [{ file, caption: "front" }])).status).toBe(200);
    expect((await put("profile", "look", [{ file: "01ARZ3NDEKTSV4RRFFQ69G5FAV.png", caption: "" }])).status).toBe(400);
    expect((await put("profile", "look", [{ file: "../wiki.json", caption: "" }])).status).toBe(400);
    const three = [1, 2, 3].map(() => ({ file, caption: "" }));
    expect((await put("profile", "look", three)).status).toBe(400);
  });

  it("still sees what was written when the form leaves the page", async () => {
    writeForm("profile", PROFILE);
    await put("profile", "lore", "Kept.");
    writeForm("profile", { ...PROFILE, pages: ["somewhere"] });
    const [form] = await formsOf();
    expect(form.applies).toBe(false);
    expect(form.values[0].value).toBe("Kept.");
    expect((await put("profile", "lore", "New")).status).toBe(409);
  });

  it("is told what's wrong with a form's file", async () => {
    writeForm("profile", PROFILE);
    await put("profile", "lore", "Kept.");
    writeForm("profile", { title: "Profile", pages: ["plan"], fields: {} });
    const [form] = await formsOf();
    expect(form.form).toBeNull();
    expect(form.problems?.length).toBeGreaterThan(0);
  });
});

describe("guests", () => {
  it("never reach a page's forms", async () => {
    writeForm("profile", PROFILE);
    for (const kind of ["view", "comment"] as const) {
      const b = s.browser(s.shares.create({ wiki: "alpha", kind }));
      expect((await b.join("Ann")).status).toBe(201);
      expect((await b.get("/api/wikis/alpha/page?path=plan")).status).toBe(200);
      expect((await b.get("/api/wikis/alpha/forms?page=plan")).status).toBe(404);
      expect(
        (await b.send("PUT", "/api/wikis/alpha/forms/profile", { page: "plan", field: "lore", value: "x" })).status,
      ).toBe(404);
    }
  });
});

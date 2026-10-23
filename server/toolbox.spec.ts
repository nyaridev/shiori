import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { KitInfo, PageData } from "../shared/api.ts";
import { sharingFixture } from "./sharing/fixture.ts";
import { isToolboxFile } from "./toolbox.ts";

const s = sharingFixture();

describe("the toolbox on the owner's server", () => {
  it("lists the template's kits and the wiki's own, without their files", async () => {
    const kits = join(s.app, "wikis", "alpha", "kits");
    mkdirSync(kits);
    writeFileSync(join(kits, "boss.md"), '---\nkit: "A boss fight"\nicon: "👹"\n---\n\n## Phases\n\n## Loot\n');
    // A new wiki's unchanged copy of a template kit is still the template's; a changed one is the wiki's.
    const template = join(s.app, "wikis", "_template", "kits");
    cpSync(join(template, "feature.md"), join(kits, "feature.md"));
    writeFileSync(join(kits, "place.md"), `${readFileSync(join(template, "place.md"), "utf8")}\n## Secrets\n`);
    const res = await s.owner("/api/wikis/alpha/kits");
    expect(res.status).toBe(200);
    const { kits: list } = (await res.json()) as { kits: KitInfo[] };
    const boss = list.find((k) => k.name === "boss");
    expect(boss).toEqual({
      name: "boss",
      description: "A boss fight",
      source: "wiki",
      icon: "👹",
      sections: ["Phases", "Loot"],
      fields: ["icon"],
    });
    const feature = list.find((k) => k.name === "feature");
    expect(feature).toMatchObject({ source: "template", type: "Feature", icon: "sparkles" });
    expect(feature?.sections).toContain("Goals");
    expect(list.find((k) => k.name === "place")).toMatchObject({ source: "wiki" });
    expect(JSON.stringify(list)).not.toContain(s.app.replaceAll("\\", "\\\\"));
    expect((await s.owner("/api/wikis/nope/kits")).status).toBe(404);
  });

  it("renders the element reference linked to the wiki, with pictures from docs/assets only", async () => {
    const res = await s.owner("/api/wikis/alpha/elements");
    const page = (await res.json()) as PageData;
    expect(page.title).toBe("Elements");
    expect(page.problems).toEqual([]);
    const html = JSON.stringify(page.hast);
    expect(html).toContain("/api/wikis/alpha/toolbox/assets/dusk.svg");
    expect(html).toContain("/w/alpha/");
    const picture = await s.owner("/api/wikis/alpha/toolbox/assets/dusk.svg");
    expect(picture.status).toBe(200);
    expect(picture.headers.get("content-type")).toBe("image/svg+xml");
    for (const path of [
      "elements.md",
      "notes.png",
      "assets/..%2Fnotes.png",
      "assets/%2e%2e",
      "adr/0001-architecture.md",
    ])
      expect((await s.owner(`/api/wikis/alpha/toolbox/${path}`)).status, path).toBe(404);
  });

  it("keeps the toolbox's own reference (_dev) on its docs", async () => {
    const page = (await (await s.owner("/api/dev/elements")).json()) as PageData;
    expect(JSON.stringify(page.hast)).toContain("/api/wikis/_dev/files/assets/dusk.svg");
  });
});

describe("the toolbox for guests", () => {
  it("doesn't exist: it's the host's (ADR-0010)", async () => {
    const share = s.shares.create({ wiki: "alpha", kind: "comment" });
    const guest = s.browser(share);
    await guest.join("Mika");
    for (const path of [
      "/api/wikis/alpha/kits",
      "/api/wikis/alpha/elements",
      "/api/wikis/alpha/toolbox/assets/dusk.svg",
    ])
      expect((await guest.get(path)).status, path).toBe(404);
  });
});

describe("isToolboxFile", () => {
  it("allows only a file right inside assets/", () => {
    expect(isToolboxFile("assets/dusk.svg")).toBe(true);
    expect(isToolboxFile("assets/a%20b.png")).toBe(true);
    for (const bad of [
      "elements.md",
      "assets/x/y.png",
      "assets/..",
      "assets/.hidden",
      "assets/%2e%2e",
      "assets/a%5Cb",
      "%E0%A4%A",
    ])
      expect(isToolboxFile(bad), bad).toBe(false);
  });
});

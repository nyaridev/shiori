import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCorpus } from "./corpus.ts";
import { listPages } from "./pages.ts";
import { loadWiki, type Wiki } from "./registry.ts";
import { closeAll } from "./threads.ts";

let root: string;

function write(rel: string, body: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shiori-img-"));
  write("wiki.json", JSON.stringify({ schema: 1, id: "demo", title: "Demo" }));
  write("cover.svg", "<svg/>");
  for (const f of ["a", "b", "c", "d", "e"]) write(`assets/${f}.png`, "png");
  write("pages/index.md", "Home, no pictures.");
  write("pages/weapons/index.md", '---\ntitle: Weapons\norder: 1\nimage: "/assets/a.png"\ncaption: All of them\n---\n');
  write(
    "pages/weapons/swords/index.md",
    '---\ntitle: Swords\n---\n:::gallery\n![Iron](/assets/b.png "Iron sword")\n![Steel](/assets/c.png)\n:::\n',
  );
  write("pages/weapons/swords/steel.md", "---\ntitle: Steel\n---\n![Again](/assets/c.png) ![](/assets/c.png)");
  write("pages/armor/helmet.md", '---\ntitle: Helmet\n---\n:::infobox[Helm]{image="/assets/d.png"}\n- Weight: 3\n:::');
  write("pages/armor/index.md", "---\ntitle: Armor\norder: 2\n---\n");
  write("pages/secret.md", "---\ntitle: Secret\nhidden: true\n---\n![](/assets/e.png)");
});
afterEach(() => {
  closeAll();
  rmSync(root, { recursive: true, force: true });
});

describe("the image viewer's groups", () => {
  it("list each page's pictures once, in reading order, with the sections above it", () => {
    const wiki = loadWiki(root, "local") as Wiki;
    const { images } = buildCorpus(wiki, listPages(wiki));
    expect(images.map((g) => [g.page.path, g.trail, g.images.map((i) => [i.src.split("/").pop(), i.caption])])).toEqual(
      [
        ["weapons", [], [["a.png", "All of them"]]],
        [
          "weapons/swords",
          ["Weapons"],
          [
            ["b.png", "Iron sword"],
            ["c.png", "Steel"],
          ],
        ],
        ["weapons/swords/steel", ["Weapons", "Swords"], [["c.png", "Again"]]],
        ["armor/helmet", ["Armor"], [["d.png", "Helm"]]],
        ["secret", [], [["e.png", undefined]]],
      ],
    );
  });
});

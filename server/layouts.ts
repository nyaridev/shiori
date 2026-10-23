// A wiki's page layouts (ADR-0006): `layouts/<name>.json`, validated by `shared/layout.ts`. Like kits, the wiki's own
// come first and the template's (`wikis/_template/layouts/`) fill in the rest, so a wiki made before a layout existed
// can use the template's kits that name it. A broken file is reported, and pages that use it show plainly.
// `layouts/front.json` isn't a page layout: it's the public wiki's front page (ADR-0012), only ever the wiki's own.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type FrontLayout, frontLayoutSchema, type Layout, layoutSchema } from "../shared/layout.ts";
import { issues } from "../shared/schema.ts";
import { APP_ROOT, readJson } from "./paths.ts";
import type { Wiki } from "./registry.ts";
import { templateDir } from "./template.ts";

/** The public front page's layout file (ADR-0012). */
export const FRONT_LAYOUT = "front";

export interface Layouts {
  layouts: Map<string, Layout>;
  /** `layouts/front.json`, when the wiki has a valid one. */
  front?: FrontLayout;
  /** One line per problem in the wiki's own files, naming the file. */
  problems: string[];
}

/** The layouts in a folder, and the names of files that aren't valid ones (with why). */
function readLayouts(dir: string): Layouts & { broken: Set<string> } {
  const out: Layouts & { broken: Set<string> } = { layouts: new Map(), problems: [], broken: new Set() };
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const name = file.slice(0, -".json".length);
    const where = `layouts/${file}`;
    const fail = (...why: string[]) => {
      out.broken.add(name);
      out.problems.push(...why.map((w) => `${where}: ${w}`));
    };
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(name)) {
      fail("name the file in lowercase letters, digits and dashes");
      continue;
    }
    const { value, error } = readJson(join(dir, file));
    if (error) {
      fail(error);
      continue;
    }
    if (name === FRONT_LAYOUT) {
      const front = frontLayoutSchema.safeParse(value);
      if (front.success) out.front = front.data;
      else fail(...issues(front.error));
      continue;
    }
    const parsed = layoutSchema.safeParse(value);
    if (parsed.success) out.layouts.set(name, parsed.data);
    else fail(...issues(parsed.error));
  }
  return out;
}

export function loadLayouts(wiki: Wiki, appRoot = APP_ROOT): Layouts {
  const own = readLayouts(join(wiki.root, "layouts"));
  const template = readLayouts(join(templateDir(appRoot), "layouts"));
  // A broken file of the wiki's own isn't covered up by the template's of the same name.
  for (const [name, layout] of template.layouts)
    if (!own.layouts.has(name) && !own.broken.has(name)) own.layouts.set(name, layout);
  return { layouts: own.layouts, problems: own.problems, ...(own.front ? { front: own.front } : {}) };
}

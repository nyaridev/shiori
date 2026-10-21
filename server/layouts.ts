// A wiki's page layouts (ADR-0006): `layouts/<name>.json`, validated by `shared/layout.ts`. A broken file is reported,
// and pages that use it fall back to the plain page.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type Layout, layoutSchema } from "../shared/layout.ts";
import { issues } from "../shared/schema.ts";
import { readJson } from "./paths.ts";
import type { Wiki } from "./registry.ts";

export interface Layouts {
  layouts: Map<string, Layout>;
  /** One line per problem, naming the file. */
  problems: string[];
}

export function loadLayouts(wiki: Wiki): Layouts {
  const dir = join(wiki.root, "layouts");
  const layouts = new Map<string, Layout>();
  const problems: string[] = [];
  if (!existsSync(dir)) return { layouts, problems };
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const name = file.slice(0, -".json".length);
    const where = `layouts/${file}`;
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(name)) {
      problems.push(`${where}: name the file in lowercase letters, digits and dashes`);
      continue;
    }
    const { value, error } = readJson(join(dir, file));
    if (error) {
      problems.push(`${where}: ${error}`);
      continue;
    }
    const parsed = layoutSchema.safeParse(value);
    if (parsed.success) layouts.set(name, parsed.data);
    else problems.push(...issues(parsed.error).map((i) => `${where}: ${i}`));
  }
  return { layouts, problems };
}

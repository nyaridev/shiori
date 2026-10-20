// wikis/_template: copying it into a new wiki (`pnpm wiki new`) and, in dev, into a filled-in preview.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { PALETTES } from "../shared/theme.ts";
import { slashes } from "./paths.ts";

export interface TemplateVars {
  id: string;
  title: string;
  tagline: string;
  accent: string;
  shiori: string;
}

export const templateDir = (appRoot: string) => join(appRoot, "wikis", "_template");

const TEXT = new Set([".md", ".json", ".svg"]);

/** Replace `{{name}}` placeholders in the template's text files. Values go into JSON and YAML strings, so escape them. */
function fill(dir: string, vars: TemplateVars) {
  const esc = (s: string) => JSON.stringify(s).slice(1, -1);
  const values: Record<string, string> = {
    id: vars.id,
    title: esc(vars.title),
    tagline: esc(vars.tagline),
    accent: vars.accent,
    initial: [...vars.title][0]?.toUpperCase() ?? "?",
    shiori: slashes(vars.shiori),
  };
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) fill(full, vars);
    else if (TEXT.has(extname(name))) {
      const text = readFileSync(full, "utf8");
      writeFileSync(
        full,
        text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => values[k] ?? m),
      );
    }
  }
}

/** Copy the template into `dest` (never its `data/`) and fill it in. */
export function copyTemplate(appRoot: string, dest: string, vars: TemplateVars) {
  cpSync(templateDir(appRoot), dest, {
    recursive: true,
    filter: (src) => basename(src) !== "data",
  });
  fill(dest, vars);
}

/** Where dev mode keeps the filled-in template. Outside the app, so the app folder stays read-only. */
export const previewDir = () => join(tmpdir(), "shiori", "template-preview");

export const PREVIEW_VARS = (appRoot: string): TemplateVars => ({
  id: "template",
  title: "Template",
  tagline: "The default wiki every new project starts from",
  accent: PALETTES.dark.accent,
  shiori: appRoot,
});

/** (Re)build the dev preview from the template. Its `data/` (comments made while testing) survives. */
export function buildPreview(appRoot: string, dest = previewDir()): string {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(dest)) {
    if (name !== "data") rmSync(join(dest, name), { recursive: true, force: true });
  }
  copyTemplate(appRoot, dest, PREVIEW_VARS(appRoot));
  const data = join(dest, "data");
  if (!existsSync(data)) {
    mkdirSync(data);
    writeFileSync(join(data, ".gitignore"), "*\n");
  }
  return dest;
}

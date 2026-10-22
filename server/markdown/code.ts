// Code blocks with colors (Shiki). The theme is CSS variables (`--code-token-keyword`…), which the app maps onto each
// wiki's design tokens, so code follows the wiki's theme like everything else. Highlighting runs once, on the server,
// when a page renders; a block in a language Shiki isn't given here stays plain.
import type { Element, ElementContent, Root } from "hast";
import { createCssVariablesTheme, createHighlighterCoreSync, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import csharp from "shiki/langs/csharp.mjs";
import css from "shiki/langs/css.mjs";
import diff from "shiki/langs/diff.mjs";
import gdscript from "shiki/langs/gdscript.mjs";
import html from "shiki/langs/html.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import jsx from "shiki/langs/jsx.mjs";
import lua from "shiki/langs/lua.mjs";
import luau from "shiki/langs/luau.mjs";
import markdown from "shiki/langs/markdown.mjs";
import powershell from "shiki/langs/powershell.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import sql from "shiki/langs/sql.mjs";
import toml from "shiki/langs/toml.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import yaml from "shiki/langs/yaml.mjs";
import { visit } from "unist-util-visit";

const THEME = "shiori";
/** The languages a wiki's code can be colored in: the house stacks (web, Roblox, Godot) and the usual extras. */
const LANGS = [
  bash,
  csharp,
  css,
  diff,
  gdscript,
  html,
  javascript,
  json,
  jsx,
  lua,
  luau,
  markdown,
  powershell,
  python,
  rust,
  sql,
  toml,
  tsx,
  typescript,
  yaml,
];

let highlighter: HighlighterCore | null = null;
/** Made on the first code block, so pages without code never pay for the grammars. */
function shiki(): HighlighterCore {
  highlighter ??= createHighlighterCoreSync({
    themes: [createCssVariablesTheme({ name: THEME, variablePrefix: "--code-", fontStyle: true })],
    langs: LANGS,
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

/** The language a fence names (```ts), or null. */
function langOf(code: Element): string | null {
  const classes = code.properties.className;
  const name = Array.isArray(classes) ? classes.find((c) => String(c).startsWith("language-")) : undefined;
  return name ? String(name).slice("language-".length).toLowerCase() : null;
}

const textIn = (node: ElementContent): string =>
  node.type === "text" ? node.value : "children" in node ? node.children.map(textIn).join("") : "";

/** Fences drawn as diagrams, by the app with Mermaid, instead of shown as code. */
const DIAGRAMS = new Set(["mermaid"]);

/**
 * rehype plugin: every fenced block becomes `<pre class="sh-code" data-lang>`, colored when its language is known.
 * A ```mermaid fence becomes `<sh-diagram>` with its source, which the app draws in the wiki's colors.
 */
export function rehypeCode(problems: string[] = [], lineOffset = 0) {
  return (tree: Root) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "pre" || !parent || index === undefined) return;
      const code = node.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
      if (!code) return;
      const lang = langOf(code);
      if (lang && DIAGRAMS.has(lang)) {
        const source = textIn(code).trim();
        if (!source)
          problems.push(`line ${(node.position?.start.line ?? 0) + lineOffset}: diagram: the block is empty`);
        parent.children[index] = {
          type: "element",
          tagName: "sh-diagram",
          properties: {},
          children: [{ type: "text", value: source }],
        };
        return;
      }
      const props = { className: ["sh-code"], dataLang: lang ?? undefined };
      const known = lang && shiki().getLoadedLanguages().includes(lang);
      if (!known) {
        node.properties = { ...node.properties, ...props };
        return;
      }
      const text = textIn(code).replace(/\n$/, "");
      const out = shiki().codeToHast(text, { lang, theme: THEME });
      const pre = out.children.find((c): c is Element => c.type === "element" && c.tagName === "pre");
      if (!pre) return;
      // The colors are the theme's variables; the block's own look comes from the app's CSS.
      pre.properties = { ...props, tabIndex: 0 };
      parent.children[index] = pre;
    });
  };
}

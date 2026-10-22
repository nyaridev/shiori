// Math (KaTeX): `$$E = mc^2$$` inside a sentence, a `$$` block on lines of its own, or a ```math fence. A single `$`
// stays a dollar sign, so prices read as prices. Formulas are typeset once, on the server, into HTML (what people see)
// and MathML (what screen readers read); the app only adds KaTeX's stylesheet and fonts. A formula KaTeX can't read
// is a page problem and shows in red where it stands.
import type { Element, ElementContent, Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import katex from "katex";
import { SKIP, visit } from "unist-util-visit";

const classesOf = (el: Element): string[] => {
  const c: unknown = el.properties.className;
  return Array.isArray(c) ? c.map(String) : typeof c === "string" ? c.split(/\s+/) : [];
};

const textIn = (node: ElementContent): string =>
  node.type === "text" ? node.value : "children" in node ? node.children.map(textIn).join("") : "";

/** KaTeX's HTML for a formula; a formula it can't read is reported and shown as its error. */
function typeset(tex: string, display: boolean, problem: (message: string) => void): string {
  const options = { displayMode: display, output: "htmlAndMathml" as const, strict: "ignore" as const, trust: false };
  try {
    return katex.renderToString(tex, { ...options, throwOnError: true });
  } catch (e) {
    problem(`math: ${(e as Error).message.replace(/^KaTeX parse error: /, "")}`);
    return katex.renderToString(tex, { ...options, throwOnError: false });
  }
}

/** rehype plugin: math from remark-math (and ```math fences) becomes KaTeX's markup. */
export function rehypeMath(problems: string[], lineOffset = 0) {
  return (tree: Root) => {
    visit(tree, "element", (node, index, parent) => {
      if (!parent || index === undefined) return;
      const code =
        node.tagName === "pre"
          ? node.children.find((c): c is Element => c.type === "element" && c.tagName === "code")
          : node.tagName === "code"
            ? node
            : undefined;
      if (!code || !classesOf(code).includes("language-math")) return;
      const display = node.tagName === "pre" || classesOf(code).includes("math-display");
      const tex = textIn(code).trim();
      const line = (node.position?.start.line ?? 0) + lineOffset;
      const html = typeset(tex, display, (message) => problems.push(`line ${line}: ${message}`));
      const children = fromHtml(html, { fragment: true }).children as ElementContent[];
      parent.children[index] = {
        type: "element",
        tagName: display ? "div" : "span",
        // The TeX rides along: search reads it instead of the typeset glyphs.
        properties: { className: [display ? "sh-math-block" : "sh-math"], dataTex: tex },
        children,
      };
      return [SKIP, index + 1];
    });
  };
}

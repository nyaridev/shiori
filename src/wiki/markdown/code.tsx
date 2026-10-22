// Code blocks. The server colors them (server/markdown/code.ts) with CSS variables, which code.css maps onto the
// wiki's tokens; here each block gets its language and a copy button.
import { type ReactNode, useRef, useState } from "react";
import { IconButton, ScrollArea, Tooltip } from "../../ui/index.ts";
import "./code.css";

/** What a fence's language is called on the block. */
const LABELS: Record<string, string> = {
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  json: "JSON",
  css: "CSS",
  html: "HTML",
  sh: "Shell",
  bash: "Shell",
  shell: "Shell",
  ps1: "PowerShell",
  powershell: "PowerShell",
  py: "Python",
  python: "Python",
  lua: "Lua",
  luau: "Luau",
  gdscript: "GDScript",
  rs: "Rust",
  rust: "Rust",
  cs: "C#",
  csharp: "C#",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  md: "Markdown",
  markdown: "Markdown",
  sql: "SQL",
  diff: "Diff",
};

export function CodeBlock({
  children,
  className,
  "data-lang": lang,
  ...rest
}: {
  children?: ReactNode;
  className?: string;
  "data-lang"?: string;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  // Fenced blocks come as `sh-code`; anything else (a `pre` inside an element) stays as it was.
  if (className !== "sh-code") {
    return (
      <pre className={className} {...rest}>
        {children}
      </pre>
    );
  }
  const copy = () => {
    const text = ref.current?.innerText ?? "";
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };
  return (
    <figure className="sh-code-block">
      <figcaption className="sh-code-head">
        <span className="sh-code-lang">{lang ? (LABELS[lang] ?? lang) : "Text"}</span>
        <Tooltip content={copied ? "Copied" : "Copy"}>
          <IconButton icon={copied ? "check" : "copy"} label="Copy code" size="sm" onClick={copy} />
        </Tooltip>
      </figcaption>
      {/* Scrolls sideways under its own scrollbar; Tab reaches it, so the keyboard scrolls it too. */}
      <ScrollArea axis="x" label={`${lang ? (LABELS[lang] ?? lang) : "Text"} code`} className="sh-code-scroll">
        <pre ref={ref} className="sh-code" {...rest} tabIndex={undefined}>
          {children}
        </pre>
      </ScrollArea>
    </figure>
  );
}

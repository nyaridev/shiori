// Diagrams: a ```mermaid fence (server/markdown/code.ts) drawn with Mermaid, in the wiki's colors and fonts. Mermaid is
// big, so it loads the first time a page has a diagram. It draws again when the theme or day/night changes.
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Callout } from "../../ui/index.ts";
import "./diagram.css";

type Mermaid = typeof import("mermaid").default;
let loading: Promise<Mermaid> | null = null;
const load = () => {
  loading ??= import("mermaid").then((m) => m.default);
  return loading;
};

/** How far a wide diagram shrinks to fit the page before it scrolls instead. */
const MIN_SCALE = 0.7;

/** One diagram at a time: Mermaid's settings are global, and each drawing uses them. */
let queue: Promise<unknown> = Promise.resolve();
const serial = <T,>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
};

/** A token as a hex color Mermaid can read: tokens are often `color-mix()`, so the browser paints one pixel of it. */
function hexOf(el: Element, token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  el.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#888888";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Mermaid's theme from the wiki's tokens, as they are where the diagram sits. */
function themeFrom(el: Element) {
  const c = (token: string) => hexOf(el, token);
  const font = getComputedStyle(el).getPropertyValue("--font-body").trim() || "sans-serif";
  const [text, surface, raised, border, accent, accentText, muted, bg] = [
    c("--text"),
    c("--surface"),
    c("--raised"),
    c("--border-strong"),
    c("--accent"),
    c("--accent-text"),
    c("--muted"),
    c("--bg"),
  ];
  return {
    fontFamily: font,
    fontSize: "14px",
    background: surface,
    primaryColor: raised,
    primaryTextColor: text,
    primaryBorderColor: accent,
    secondaryColor: surface,
    secondaryTextColor: text,
    secondaryBorderColor: border,
    tertiaryColor: bg,
    tertiaryTextColor: text,
    tertiaryBorderColor: border,
    lineColor: muted,
    textColor: text,
    mainBkg: raised,
    nodeBorder: accent,
    clusterBkg: bg,
    clusterBorder: border,
    titleColor: text,
    edgeLabelBackground: surface,
    actorBkg: raised,
    actorBorder: accent,
    actorTextColor: text,
    signalColor: text,
    signalTextColor: text,
    labelBoxBkgColor: raised,
    labelTextColor: text,
    noteBkgColor: surface,
    noteTextColor: text,
    noteBorderColor: border,
    activationBkgColor: accent,
    sectionBkgColor: raised,
    altSectionBkgColor: surface,
    taskBkgColor: accent,
    taskTextColor: accentText,
    taskTextLightColor: text,
    taskBorderColor: accent,
    doneTaskBkgColor: muted,
    critBkgColor: c("--tone-bad"),
    todayLineColor: c("--tone-warn"),
    pie1: accent,
    git0: accent,
  };
}

/** A key that changes with the wiki's theme and the viewer's day/night: useTheme sets both as tokens on <html>. */
const themeKey = () => document.documentElement.getAttribute("style") ?? "";
function useThemeKey(): string {
  const [key, setKey] = useState(themeKey);
  useEffect(() => {
    const observer = new MutationObserver(() => setKey(themeKey()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);
  return key;
}

const sourceOf = (children: ReactNode): string =>
  typeof children === "string" ? children : Array.isArray(children) ? children.map(sourceOf).join("") : "";

export function DiagramEl({ children }: { children?: ReactNode }) {
  const source = sourceOf(children);
  const ref = useRef<HTMLDivElement>(null);
  const id = `sh-diagram-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const theme = useThemeKey();
  const [state, setState] = useState<{ svg?: string; error?: string }>({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: `theme` draws it again in the new colors.
  useEffect(() => {
    const el = ref.current;
    if (!el || !source) return;
    let live = true;
    serial(async () => {
      const mermaid = await load();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: themeFrom(el),
        flowchart: { htmlLabels: false },
      });
      return mermaid.render(id, source);
    }).then(
      ({ svg }) => live && setState({ svg }),
      (e: Error) => live && setState({ error: e.message || String(e) }),
    );
    return () => {
      live = false;
    };
  }, [source, theme, id]);

  // Mermaid scales a wide drawing down to any width, until its labels can't be read: it shrinks to fit only so far,
  // then scrolls.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once Mermaid's drawing is in the page.
  useLayoutEffect(() => {
    const svg = ref.current?.querySelector<SVGSVGElement>(".sh-diagram-svg svg");
    const width = svg?.viewBox.baseVal?.width;
    if (!svg || !width) return;
    svg.style.width = `${Math.ceil(width)}px`;
    svg.style.maxWidth = "100%";
    svg.style.minWidth = `${Math.ceil(width * MIN_SCALE)}px`;
  }, [state.svg]);

  return (
    <figure className="sh-diagram" ref={ref} data-state={state.error ? "error" : state.svg ? "drawn" : "drawing"}>
      {state.error ? (
        <Callout tone="danger" title="This diagram can't be drawn">
          <pre className="sh-diagram-error">{state.error}</pre>
        </Callout>
      ) : state.svg ? (
        // Mermaid's own markup, drawn with its strict security level: no scripts, links or HTML labels.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: an SVG Mermaid made from the page's diagram text.
        <div className="sh-diagram-svg" dangerouslySetInnerHTML={{ __html: state.svg }} />
      ) : (
        <div className="sh-diagram-loading">Drawing the diagram…</div>
      )}
    </figure>
  );
}

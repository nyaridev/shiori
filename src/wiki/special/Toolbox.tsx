// The toolbox: special pages that list everything a wiki's pages can use. Page kits (the kinds of page agents start
// from), the element reference in the wiki's own theme, the frontmatter fields, and the special pages themselves.
import { Link } from "react-router";
import type { WikiDetail } from "../../../shared/api.ts";
import { FRONTMATTER_FIELDS } from "../../../shared/schema.ts";
import { ICONS } from "../../icons/index.ts";
import { api } from "../../lib/api.ts";
import { useResource } from "../../lib/useResource.ts";
import { Badge } from "../../ui/index.ts";
import { CodeBlock } from "../markdown/code.tsx";
import { Markdown } from "../markdown/Markdown.tsx";
import { specialHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { SPECIALS } from "./specials.ts";

/** A command or a snippet, with the code block's copy button. */
function Snippet({ lang, text }: { lang: string; text: string }) {
  return (
    <div className="sh-prose sh-snippet">
      <CodeBlock className="sh-code" data-lang={lang}>
        <code>{text}</code>
      </CodeBlock>
    </div>
  );
}

export function Kits({ wiki }: { wiki: WikiDetail }) {
  const kits = useResource(`kits:${wiki.id}`, () => api.kits(wiki.id));
  if (kits.error) return <p className="sh-special-empty">Couldn't load the kits: {kits.error.message}</p>;
  if (!kits.data) return <p className="sh-special-empty">Loading…</p>;
  return (
    <>
      <p className="sh-toolbox-intro">
        A kit is a starting point for a kind of page: its frontmatter, sections and elements, ready to fill in. Agents
        make a page from one with the command under it. A wiki can add its own kinds as{" "}
        <code>kits/&lt;name&gt;.md</code>; they come first.
      </p>
      <div className="sh-kits">
        {kits.data.map((k) => (
          <article key={k.name} className="sh-kit">
            <header className="sh-kit-head">
              <PageIcon icon={k.icon} fallback="page" className="sh-kit-icon" />
              <h2 className="sh-kit-name">{k.type ?? k.name}</h2>
              {k.source === "wiki" && <Badge tone="accent">This wiki's own</Badge>}
            </header>
            {k.description && <p className="sh-kit-text">{k.description}</p>}
            {k.sections.length > 0 && (
              <p className="sh-kit-line">
                <span className="sh-kit-label">Sections</span>
                {k.sections.join(" · ")}
              </p>
            )}
            {k.fields.length > 0 && (
              <p className="sh-kit-line">
                <span className="sh-kit-label">Fields</span>
                {k.fields.map((f) => (
                  <code key={f}>{f}</code>
                ))}
              </p>
            )}
            <Snippet lang="bash" text={`pnpm wiki page ${wiki.id} <path> --kit ${k.name}`} />
          </article>
        ))}
      </div>
    </>
  );
}

export function Elements({ wiki }: { wiki: WikiDetail }) {
  const page = useResource(`elements:${wiki.id}`, () => api.wikiElements(wiki.id));
  if (page.error) return <p className="sh-special-empty">Couldn't load the elements: {page.error.message}</p>;
  if (!page.data) return <p className="sh-special-empty">Loading…</p>;
  return (
    <>
      <p className="sh-toolbox-intro">
        Every element a page can use, written as agents write it and shown in this wiki's theme. Links point at this
        wiki's pages, red where it has none.
      </p>
      <div className="sh-prose">
        <Markdown hast={page.data.hast} />
      </div>
    </>
  );
}

export function Fields() {
  return (
    <>
      <p className="sh-toolbox-intro">
        What a page's frontmatter (the YAML between <code>---</code> lines at its top) can set. Anything else is
        reported by <code>pnpm wiki check</code>. Quote values that contain a colon.
      </p>
      <dl className="sh-fm-fields">
        {FRONTMATTER_FIELDS.map((f) => (
          <div key={f.key} className="sh-fm-field">
            <dt>
              <code className="sh-fm-key">{f.key}</code>
            </dt>
            <dd>
              <p className="sh-kit-text">{f.what}</p>
              <Snippet lang="yaml" text={f.example} />
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** Shiori's icon set: what a page's `icon` names before a wiki draws its own. */
export function Icons() {
  const names = Object.keys(ICONS).sort();
  return (
    <>
      <p className="sh-toolbox-intro">
        Drawn icons every wiki can use. A page picks one by name in its frontmatter (<code>icon: compass</code>), and
        the sidebar, cards and links show it. Use one of these whenever it fits, so the same thing has the same icon
        everywhere; only when none does, draw one for the wiki in <code>assets/icons/</code> and reuse it.
      </p>
      <ul className="sh-icon-grid">
        {names.map((name) => (
          <li key={name} className="sh-icon-cell">
            <PageIcon icon={name} className="sh-icon-big" />
            <code>{name}</code>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Specials({ wikiId }: { wikiId: string }) {
  return (
    <ul className="sh-special-list">
      {SPECIALS.map((s) => (
        <li key={s.route} className="sh-special-row">
          <Link to={specialHref(wikiId, s.route)} className="sh-special-link">
            <PageIcon icon={s.icon} />
            {s.title}
          </Link>
          <span className="sh-special-summary">{s.summary}</span>
        </li>
      ))}
    </ul>
  );
}

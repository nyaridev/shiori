// The fact box beside an article (ADR-0002), from the page's frontmatter: `image`, `caption`, `infobox` rows, plus
// its type and status. It floats right at the top of the article, as on Wikipedia and Fandom.
import type { PageData } from "../../shared/api.ts";
import { withBase } from "../lib/base.ts";
import { Markdown } from "./markdown/Markdown.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

export function PageInfobox({ page }: { page: PageData }) {
  const box = page.infobox;
  if (!box) return null;
  return (
    <aside className="sh-page-infobox" aria-label={`About ${page.title}`}>
      <header className="sh-page-infobox-head">
        <span className="sh-page-infobox-title">
          {page.icon && <span aria-hidden="true">{page.icon} </span>}
          {page.title}
        </span>
        {page.type && <span className="sh-page-infobox-type">{page.type}</span>}
      </header>
      {box.image && (
        <figure className="sh-page-infobox-figure">
          <img src={withBase(box.image)} alt={box.caption ?? page.title} />
          {box.caption && <figcaption>{box.caption}</figcaption>}
        </figure>
      )}
      {(page.status || box.rows.length > 0) && (
        <dl className="sh-page-infobox-rows">
          {page.status && (
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={page.status} />
              </dd>
            </div>
          )}
          {box.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <Markdown hast={row.value} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}

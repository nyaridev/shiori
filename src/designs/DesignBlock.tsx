// A page's `design` block (ADR-0006): the design it was made from — the drawing, the description and the pictures —
// with a link to open it.
import { Link } from "react-router";
import { api } from "../lib/api.ts";
import { picture } from "../lib/base.ts";
import { useResource } from "../lib/useResource.ts";
import { designHref } from "./DesignsGallery.tsx";
import "./designs.css";

export function DesignBlock({ wikiId, design }: { wikiId: string; design?: { collection: string; id: string } }) {
  const d = useResource(design ? `design:${wikiId}:${design.collection}:${design.id}` : null, () =>
    api.design(wikiId, design?.collection ?? "", design?.id ?? ""),
  );
  if (!design) return <p className="sh-block-empty">This page names no design (`design:` in its frontmatter).</p>;
  if (d.error) return <p className="sh-block-empty">The design “{design.id}” isn't there any more.</p>;
  if (!d.data) return null;
  return (
    <figure className="sh-design-block">
      <Link to={designHref(wikiId, d.data)} className="sh-design-block-board">
        {d.data.board ? (
          <img src={picture(d.data.board, 1600)} alt={`The drawing of ${d.data.name}`} />
        ) : (
          <span className="sh-block-empty">Not drawn yet.</span>
        )}
      </Link>
      <figcaption>
        <span>
          <Link to={designHref(wikiId, d.data)} className="sh-link">
            {d.data.name}
          </Link>
          , drawn by {d.data.mine ? "you" : d.data.author.name}
        </span>
        {d.data.description && <span className="sh-design-text">{d.data.description}</span>}
      </figcaption>
      {d.data.images.length > 0 && (
        <ul className="sh-design-pictures">
          {d.data.images.map((i) => (
            <li key={i.file}>
              <img src={picture(i.url, 480)} alt={i.caption} loading="lazy" />
              {i.caption && <span>{i.caption}</span>}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

// What a link preview shows about a page: its picture, icon and title, what kind of page it is, and its first lines.
import type { PageEntry } from "../../shared/api.ts";
import { StatusBadge } from "./StatusBadge.tsx";
import "./preview.css";

export function PagePreview({ page }: { page: PageEntry }) {
  return (
    <div className="sh-preview">
      {page.image && <img className="sh-preview-image" src={page.image} alt="" />}
      <div className="sh-preview-body">
        <p className="sh-preview-title">
          {page.icon && <span aria-hidden="true">{page.icon} </span>}
          {page.title}
        </p>
        {(page.type || page.status) && (
          <p className="sh-preview-meta">
            {page.type && <span className="sh-page-type">{page.type}</span>}
            {page.status && <StatusBadge status={page.status} />}
          </p>
        )}
        {page.summary && <p className="sh-preview-summary">{page.summary}</p>}
        {page.excerpt && page.excerpt !== page.summary && <p className="sh-preview-excerpt">{page.excerpt}</p>}
        {page.tags.length > 0 && (
          <p className="sh-preview-tags">
            {page.tags.map((t) => (
              <span key={t} className="sh-tag">
                #{t}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

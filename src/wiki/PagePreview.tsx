// What a link preview shows about a page: its picture, icon and title, what kind of page it is, and its first lines.
import type { PageEntry } from "../../shared/api.ts";
import { StatusBadge } from "./StatusBadge.tsx";
import "./preview.css";
import { picture } from "../lib/base.ts";
import { PageIcon } from "./PageIcon.tsx";

export function PagePreview({ page }: { page: PageEntry }) {
  return (
    <div className="sh-preview">
      {page.image && <img className="sh-preview-image" src={picture(page.image, 480)} alt="" />}
      <div className="sh-preview-body">
        <p className="sh-preview-title">
          <PageIcon icon={page.icon} className="sh-icon-gap" />
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

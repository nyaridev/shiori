// The tabs under a page's head (ADR-0015): "Page" first, always, then each of the page's forms. Only the owner sees
// them; the open one is `?view=<form>` in the URL, so a form can be linked to and survives a reload.
import { Link } from "react-router";
import type { PageForm } from "../../../shared/form.ts";
import { Icon } from "../../ui/index.ts";
import { pageHref } from "../PageHead.tsx";
import "./forms.css";

export const formHref = (wikiId: string, path: string, form: string) =>
  `${pageHref(wikiId, path)}?view=${encodeURIComponent(form)}`;

export function PageTabs({
  wikiId,
  path,
  forms,
  current,
}: {
  wikiId: string;
  path: string;
  forms: PageForm[];
  /** The open form's name; null for the page. */
  current: string | null;
}) {
  if (!forms.length) return null;
  return (
    <nav className="sh-page-tabs" aria-label="Page and its forms" data-noquote="">
      <Link
        to={pageHref(wikiId, path)}
        replace
        className="sh-page-tab"
        aria-current={current === null ? "page" : undefined}
      >
        Page
      </Link>
      {forms.map((f) => (
        <Link
          key={f.name}
          to={formHref(wikiId, path, f.name)}
          replace
          className="sh-page-tab"
          aria-current={current === f.name ? "page" : undefined}
          title="Only you see this tab: not guests, nor the public wiki"
          data-stale={!f.applies || undefined}
        >
          {f.form?.title ?? f.name}
          <Icon name="lock" size={11} />
        </Link>
      ))}
    </nav>
  );
}

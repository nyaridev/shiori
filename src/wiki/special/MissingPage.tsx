// What a red link opens: a page that isn't written yet. Like Wikipedia's, it says so and shows who wants it.
import { useEffect } from "react";
import { Link } from "react-router";
import type { WikiIndex } from "../../../shared/api.ts";
import { PageChip } from "../PageFoot.tsx";
import { pageHref, specialHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";

export function MissingPage({ wikiId, path, index }: { wikiId: string; path: string; index?: WikiIndex }) {
  const wanted = index?.wanted.find((w) => w.path === path);
  const title = wanted?.title ?? path.split("/").pop() ?? path;
  useEffect(() => {
    document.title = `${title} (not written yet)`;
  }, [title]);
  return (
    <main className="sh-wiki-main" data-path={path}>
      <header className="sh-page-head">
        <p className="sh-special-kicker">Not written yet</p>
        <h1 className="sh-page-title">
          <PageIcon icon="puzzle" className="sh-page-icon" />
          {title}
        </h1>
        <p className="sh-page-summary">
          There's no page at “{path}” yet.
          {wanted && " Other pages link here, so it's worth writing: ask an agent to create it."}
        </p>
      </header>
      {wanted && (
        <section className="sh-foot-block" aria-labelledby="sh-wanted-by">
          <h2 id="sh-wanted-by" className="sh-sections-title">
            Wanted by
          </h2>
          <div className="sh-chips">
            {wanted.from.map((p) => (
              <PageChip key={p.path} wikiId={wikiId} page={p} />
            ))}
          </div>
        </section>
      )}
      <p className="sh-missing-links">
        <Link to={pageHref(wikiId, "")}>Go to the home page</Link> ·{" "}
        <Link to={specialHref(wikiId, "wanted")}>All wanted pages</Link>
      </p>
    </main>
  );
}

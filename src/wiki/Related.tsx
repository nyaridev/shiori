// Related pages from a page's `related:` frontmatter, grouped by kind ("Depends on", "Competitor of"). `::related`
// places it in the article; otherwise the page's foot shows it.
import type { PageData } from "../../shared/api.ts";
import { PageChip } from "./PageFoot.tsx";

export function Related({ wikiId, page, kind }: { wikiId: string; page: PageData; kind?: string }) {
  const groups = kind ? page.related.filter((g) => g.kind.toLowerCase() === kind.toLowerCase()) : page.related;
  if (!groups.length) return null;
  return (
    <div className="sh-related">
      {groups.map((g) => (
        <div key={g.kind} className="sh-related-group">
          <span className="sh-related-kind">{g.kind}</span>
          <span className="sh-chips">
            {g.pages.map((p) => (
              <PageChip key={p.path} wikiId={wikiId} page={p} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// The public wiki (ADR-0011) in the Share dialog: how many pages go public, what's left out of them, and the buttons
// that open a preview and download the static site. It works in dev too, where links can't be made.
import { useEffect, useState } from "react";
import type { PublicReport } from "../../shared/api.ts";
import { api } from "../lib/api.ts";
import { Button, Callout } from "../ui/index.ts";

const REMOVED: [keyof PublicReport["removed"], string, string][] = [
  ["private", "private block", "private blocks"],
  ["code", "code block", "code blocks"],
  ["questions", "question", "questions"],
  ["fields", "private field", "private fields"],
  ["pictures", "private picture", "private pictures"],
  ["links", "link to a private page", "links to private pages"],
  ["elements", "app-only block", "app-only blocks"],
];

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PublicSummary({ wikiId }: { wikiId: string }) {
  const [report, setReport] = useState<PublicReport | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.publicReport(wikiId).then(
      (r) => live && setReport(r),
      (e: Error) => live && setProblem(e.message),
    );
    return () => {
      live = false;
    };
  }, [wikiId]);

  if (problem) return <p className="sh-share-problem">{problem}</p>;
  if (!report) return <p className="sh-share-quiet">Reading what goes public…</p>;
  const left = REMOVED.filter(([k]) => report.removed[k] > 0).map(([k, one, many]) =>
    count(report.removed[k], one, many),
  );
  const base = `/api/wikis/${encodeURIComponent(wikiId)}`;
  return (
    <section className="sh-share-public" aria-label="The public wiki">
      <p>
        <strong>{count(report.pages.length, "page goes", "pages go")} public</strong>
        <span className="sh-share-quiet">
          {" "}
          · {count(report.privatePages, "page stays", "pages stay")} private ·{" "}
          {count(report.pictures, "picture", "pictures")}
        </span>
      </p>
      <p className="sh-share-quiet">
        Readers can't comment or see the home page, the roadmap, questions, designs or anything marked private.
        {left.length > 0 && ` Left out of its pages: ${left.join(", ")}.`}
      </p>
      {report.pages.length === 0 && (
        <Callout tone="note" title="No page is public yet">
          <p>
            List them in <code>wiki.json</code> as{" "}
            <code>
              "public": {"{"} "pages": ["mobs/**"] {"}"}
            </code>
            , or give a page <code>public: true</code>.
          </p>
        </Callout>
      )}
      {report.problems.length > 0 && (
        <ul className="sh-share-public-problems">
          {report.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="sh-share-row">
        <Button
          size="sm"
          variant="soft"
          icon="eye"
          onClick={() => window.open(`${base}/public/site/`, "_blank", "noopener")}
        >
          Preview
        </Button>
        <Button
          size="sm"
          variant="soft"
          icon="share"
          disabled={!report.pages.length && !report.front}
          onClick={() => {
            window.location.href = `${base}/public.zip`;
          }}
        >
          Download .zip
        </Button>
      </div>
    </section>
  );
}

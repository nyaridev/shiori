// What a tester sees through a board link (ADR-0010): the board, in the wiki's colors, and nothing of the wiki. They
// report bugs, changes and ideas, and follow what happens to them: on a global board everyone's, on a private one
// only their own.
import { useCallback, useEffect, useState } from "react";
import type { BoardView } from "../../shared/api.ts";
import { useGuest } from "../guest/GuestContext.ts";
import { ApiError } from "../lib/api.ts";
import { poll } from "../lib/live.ts";
import { useTheme } from "../lib/useTheme.ts";
import { Segmented } from "../ui/index.ts";
import { PageIcon } from "../wiki/PageIcon.tsx";
import { testerApi } from "./api.ts";
import { STATUS } from "./labels.ts";
import { KindMark, ReportCard } from "./ReportCard.tsx";
import { ReportForm } from "./ReportForm.tsx";
import "./boards.css";

type Whose = "mine" | "all";

export function TesterBoard({ onEnded }: { onEnded: (status: number) => void }) {
  const guest = useGuest();
  const [view, setView] = useState<BoardView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [whose, setWhose] = useState<Whose>("all");
  useTheme(view?.wiki.theme);

  const load = useCallback(async () => {
    try {
      setView(await testerApi.view());
    } catch (e) {
      if (e instanceof ApiError && [401, 403, 404, 410].includes(e.status)) onEnded(e.status);
      else setProblem("Couldn't load the board. Try again in a moment.");
    }
  }, [onEnded]);

  // The first answer loads the board; every later one means it changed.
  useEffect(() => poll("/api/board/changes", () => void load(), onEnded), [load, onEnded]);

  useEffect(() => {
    if (view) document.title = `${view.board.name} · ${view.wiki.title}`;
  }, [view]);

  if (!view) return <main className="sh-guest">{problem && <p className="sh-guest-text">{problem}</p>}</main>;
  const global = view.board.visibility === "global";
  // Still open first, finished ones after; newest first within each (the server's order).
  const shown = view.reports
    .filter((r) => !global || whose === "all" || r.mine)
    .sort((a, b) => Number(STATUS[a.status].done) - Number(STATUS[b.status].done));
  const after = async (p: Promise<unknown>) => {
    await p;
    await load();
  };

  return (
    <main className="sh-tester">
      <header className="sh-tester-head sh-tester-hero">
        <KindMark kind="bug" size="lg" />
        <div>
          <p className="sh-guest-kicker">{view.wiki.title} · test board</p>
          <h1 className="sh-tester-title">{view.board.name}</h1>
          <p className="sh-guest-text">
            Found a bug, or want something to change? Tell the team here, with a screenshot or a GIF if it helps.{" "}
            {global ? "Everyone on this board sees every report." : "Only you and the team see your reports."}
          </p>
          <p className="sh-tester-facts">
            <span>
              <PageIcon icon="person" /> {guest?.guest?.name}
            </span>
            <span>
              <PageIcon icon={global ? "people" : "person"} /> {global ? "Shared board" : "Private board"}
            </span>
            <span>
              {view.reports.length} report{view.reports.length === 1 ? "" : "s"} ·{" "}
              {view.reports.filter((r) => r.status === "fixed").length} fixed
            </span>
          </p>
        </div>
      </header>
      {view.board.closedAt ? (
        <p className="sh-tester-closed">This board is closed and takes no new reports. Thank you for testing!</p>
      ) : (
        <ReportForm onSent={() => void load()} />
      )}
      <section className="sh-tester-reports" aria-label="Reports">
        <div className="sh-tester-reports-head">
          <h2>{global && whose === "all" ? "Reports" : "Your reports"}</h2>
          {global && (
            <Segmented
              label="Whose reports"
              value={whose}
              onChange={setWhose}
              options={[
                { value: "all", label: "Everyone's" },
                { value: "mine", label: "Yours" },
              ]}
            />
          )}
        </div>
        {!shown.length && (
          <div className="sh-board-empty">
            <PageIcon icon="bug" />
            <p>Nothing reported yet. Your first report shows here.</p>
          </div>
        )}
        {shown.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            pictureUrl={testerApi.pictureUrl}
            tester={
              r.mine
                ? {
                    edit: (change) => after(testerApi.edit(r.id, change)),
                    remove: () => after(testerApi.remove(r.id)),
                  }
                : undefined
            }
          />
        ))}
      </section>
    </main>
  );
}

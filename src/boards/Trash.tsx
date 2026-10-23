// The boards' trash (ADR-0014): boards the owner moved there, under the list at `_/boards`. Each one is deleted for
// good `BOARD_TRASH_DAYS` after it was trashed (Shiori does it when it starts), or at once with Delete now, which
// asks first. Restore puts it back as it was.
import { useState } from "react";
import { Link } from "react-router";
import { BOARD_TRASH_DAYS, type Board } from "../../shared/api.ts";
import { Button } from "../ui/index.ts";
import { specialHref } from "../wiki/PageHead.tsx";
import { boardsApi } from "./api.ts";

const DAY = 24 * 60 * 60 * 1000;

/** When a trashed board is deleted for good, and how many days that is from now (at least 0). */
export function purgeOf(trashedAt: string, now = Date.now()) {
  const at = Date.parse(trashedAt) + BOARD_TRASH_DAYS * DAY;
  return { date: new Date(at), days: Math.max(0, Math.ceil((at - now) / DAY)) };
}

/** "Deleted for good in 12 days (3 Nov)": when a trashed board goes. */
export function purgeText(trashedAt: string) {
  const { date, days } = purgeOf(trashedAt);
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const when = days === 0 ? "when Shiori next starts" : `in ${days} day${days === 1 ? "" : "s"} (${day})`;
  return `Deleted for good ${when}`;
}

/** Delete now, asked twice: the board, its reports and their pictures go, and nothing brings them back. */
export function DeleteForever({ wikiId, board, onDone }: { wikiId: string; board: Board; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reports = board.counts?.total ?? 0;
  const purge = async () => {
    try {
      await boardsApi.purge(wikiId, board.uid);
      onDone();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't delete the board.");
    }
  };
  if (!asking)
    return (
      <Button size="sm" variant="ghost" icon="trash" onClick={() => setAsking(true)}>
        Delete now
      </Button>
    );
  return (
    <div className="sh-trash-confirm" role="alert">
      <span className="sh-trash-confirm-text">
        Delete “{board.name}”{reports ? ` and its ${reports} report${reports === 1 ? "" : "s"}` : ""} for good? Pictures
        go too. This can't be undone.
      </span>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
        Keep
      </Button>
      <Button size="sm" variant="ghost" icon="trash" onClick={() => void purge()}>
        Delete for good
      </Button>
      {problem && <p className="sh-discussion-problem">{problem}</p>}
    </div>
  );
}

/** The trash under the boards: nothing when it's empty. */
export function BoardTrash({ wikiId, boards, onChange }: { wikiId: string; boards: Board[]; onChange: () => void }) {
  if (!boards.length) return null;
  const restore = async (uid: string) => {
    await boardsApi.change(wikiId, uid, { trashed: false });
    onChange();
  };
  return (
    <section className="sh-trash" aria-labelledby="sh-trash-title">
      <header className="sh-trash-head">
        <h2 id="sh-trash-title">Trash</h2>
        <p>
          Boards here take no reports and their links don't work. Each is deleted for good, with its reports and their
          pictures, {BOARD_TRASH_DAYS} days after it was moved here.
        </p>
      </header>
      <ul className="sh-trash-list">
        {boards.map((b) => {
          const total = b.counts?.total ?? 0;
          return (
            <li key={b.uid} className="sh-trash-row">
              <span className="sh-trash-what">
                <Link to={specialHref(wikiId, "boards", b.uid)} className="sh-trash-name">
                  {b.name}
                </Link>
                <span className="sh-trash-meta">
                  {total ? `${total} report${total === 1 ? "" : "s"}` : "No reports"} ·{" "}
                  {b.trashedAt && purgeText(b.trashedAt)}
                </span>
              </span>
              <span className="sh-trash-actions">
                <Button size="sm" variant="ghost" icon="undo" onClick={() => void restore(b.uid)}>
                  Restore
                </Button>
                <DeleteForever wikiId={wikiId} board={b} onDone={onChange} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

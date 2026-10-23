// The owner's test boards (ADR-0010), at `_/boards`: make one, and see how many reports each has.
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Board } from "../../shared/api.ts";
import { useLive } from "../lib/live.ts";
import { useResource } from "../lib/useResource.ts";
import { Badge, Button, Input, Segmented } from "../ui/index.ts";
import { specialHref } from "../wiki/PageHead.tsx";
import { PageIcon } from "../wiki/PageIcon.tsx";
import { boardsApi } from "./api.ts";
import "./boards.css";

export const VISIBILITY: { value: Board["visibility"]; label: string; hint: string }[] = [
  { value: "global", label: "Everyone sees all", hint: "Testers see every report on the board, read-only." },
  { value: "private", label: "Each sees their own", hint: "Testers see only what they reported." },
];

/** A wiki's boards, kept live: reports land in the wiki's database. No wiki id: nothing is loaded. */
export function useBoards(wikiId: string) {
  const boards = useResource(wikiId ? `boards:${wikiId}` : null, () => boardsApi.list(wikiId));
  const { reload } = boards;
  useLive((e) => {
    if (e.type === "threads" && e.wiki === wikiId) reload();
  });
  return boards;
}

export function Boards({ wikiId }: { wikiId: string }) {
  const boards = useBoards(wikiId);
  return (
    <div className="sh-boards">
      <NewBoard wikiId={wikiId} />
      {boards.error && <p className="sh-special-empty">Couldn't load the boards: {boards.error.message}</p>}
      {boards.data && !boards.data.length && (
        <p className="sh-special-empty">
          No boards yet. Make one, share it with your testers, and their bug reports, changes and ideas land here.
        </p>
      )}
      <ul className="sh-boards-list">
        {boards.data?.map((b) => {
          const total = b.counts?.total ?? 0;
          const done = b.counts?.done ?? 0;
          return (
            <li key={b.uid}>
              <Link
                to={specialHref(wikiId, "boards", b.uid)}
                className="sh-boards-card"
                data-closed={b.closedAt ? "" : undefined}
              >
                <span className="sh-boards-top">
                  <span className="sh-kind-mark" data-kind="bug" data-size="lg" aria-hidden="true">
                    <PageIcon icon="bug" />
                  </span>
                  <span className="sh-boards-name">{b.name}</span>
                  {!!b.counts?.new && <Badge tone="accent">{b.counts.new} new</Badge>}
                </span>
                <span className="sh-boards-meta">
                  <PageIcon icon={b.visibility === "global" ? "people" : "person"} />
                  {b.visibility === "global" ? "Everyone sees all" : "Each sees their own"}
                  {b.closedAt && <Badge>Closed</Badge>}
                </span>
                <span className="sh-board-progress" aria-hidden="true">
                  <span style={{ width: total ? `${(done / total) * 100}%` : "0%" }} />
                </span>
                <span className="sh-boards-count">
                  {total ? `${done} of ${total} report${total === 1 ? "" : "s"} done with` : "No reports yet"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NewBoard({ wikiId }: { wikiId: string }) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<Board["visibility"]>("global");
  const [problem, setProblem] = useState<string | null>(null);
  const navigate = useNavigate();
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const board = await boardsApi.create(wikiId, name.trim(), visibility);
      navigate(specialHref(wikiId, "boards", board.uid));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't make the board.");
    }
  };
  return (
    <form className="sh-boards-new" onSubmit={(e) => void create(e)}>
      <Input
        value={name}
        maxLength={60}
        placeholder="A new board: “Alpha playtest”"
        aria-label="The board's name"
        onChange={(e) => setName(e.target.value)}
      />
      <Segmented label="Who sees what" value={visibility} onChange={setVisibility} options={VISIBILITY} />
      <Button type="submit" variant="solid" icon="plus" disabled={!name.trim()}>
        New board
      </Button>
      {problem && <p className="sh-discussion-problem">{problem}</p>}
      <p className="sh-boards-hint">{VISIBILITY.find((v) => v.value === visibility)?.hint}</p>
    </form>
  );
}

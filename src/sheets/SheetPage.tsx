// One data sheet for the owner (ADR-0010), at `_/sheets/<name>`: the table to tune, the Share button that makes a
// sheet link, and the history: every change with who made it, undo one, or take back everything one guest did.
import { useEffect, useState } from "react";
import type { SheetEdit } from "../../shared/sheet.ts";
import { ApiError } from "../lib/api.ts";
import { useLive } from "../lib/live.ts";
import { ago } from "../lib/time.ts";
import { useResource } from "../lib/useResource.ts";
import { ShareDialog } from "../sharing/ShareDialog.tsx";
import { Badge, Button, Callout } from "../ui/index.ts";
import { sheetsApi } from "./api.ts";
import { SheetTable } from "./SheetTable.tsx";

/** A sheet, kept live: people's changes land in the database, the agent's in the file. */
export function useSheet(wikiId: string, name: string) {
  const sheet = useResource(`sheet:${wikiId}:${name}`, () => sheetsApi.view(wikiId, name));
  const { reload } = sheet;
  useLive((e) => {
    if ((e.type === "threads" || e.type === "pages") && "wiki" in e && e.wiki === wikiId) reload();
  });
  return sheet;
}

export function SheetPage({
  wikiId,
  name,
  onTitle,
}: {
  wikiId: string;
  name: string;
  onTitle?: (title: string) => void;
}) {
  const sheet = useSheet(wikiId, name);
  const [history, setHistory] = useState(false);
  useEffect(() => {
    if (sheet.data) onTitle?.(sheet.data.title);
  }, [sheet.data, onTitle]);

  if (sheet.error) {
    const problems = sheet.error instanceof ApiError ? (sheet.error.data as { problems?: string[] })?.problems : null;
    return (
      <Callout tone="warning" title={problems ? "This sheet's file has problems" : "Couldn't open this sheet"}>
        {problems ? (
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p>{sheet.error.message}</p>
        )}
        <p>An agent fixes `sheets/{name}.json`; `pnpm shiori check` says what's wrong.</p>
      </Callout>
    );
  }
  if (!sheet.data) return <p className="sh-special-empty">Loading…</p>;
  const view = sheet.data;
  return (
    <div className="sh-sheet-page">
      <div className="sh-board-bar">
        {view.description && <p className="sh-sheet-description">{view.description}</p>}
        <span className="sh-board-spacer" />
        <Button variant="ghost" icon="undo" onClick={() => setHistory((h) => !h)}>
          {history ? "Hide history" : "History"}
        </Button>
        <ShareDialog
          wikiId={wikiId}
          title={view.title}
          target={{ kind: "sheet", id: view.name, title: view.title }}
          trigger={
            <Button variant="solid" icon="share">
              Share sheet
            </Button>
          }
        />
      </div>
      <SheetTable view={view} onSet={sheetsApi.set(wikiId, name)} />
      {history && <History wikiId={wikiId} name={name} onChange={sheet.reload} />}
    </div>
  );
}

function History({ wikiId, name, onChange }: { wikiId: string; name: string; onChange: () => void }) {
  const edits = useResource(`sheet-history:${wikiId}:${name}`, () => sheetsApi.history(wikiId, name));
  const { reload } = edits;
  useLive((e) => {
    if (e.type === "threads" && e.wiki === wikiId) reload();
  });
  const [problem, setProblem] = useState<string | null>(null);
  const act = async (p: Promise<unknown>) => {
    setProblem(null);
    try {
      await p;
    } catch (e) {
      setProblem(
        e instanceof ApiError && e.status === 409 ? "It changed again since; undo the newer change first." : String(e),
      );
    }
    reload();
    onChange();
  };
  if (!edits.data) return null;
  // Guests who changed something, for "take back everything they did".
  const guests = new Map<string, string>();
  for (const e of edits.data) if (e.guestId) guests.set(e.guestId, e.name);
  return (
    <section className="sh-sheet-history" aria-label="History">
      <h2 className="sh-special-heading">History</h2>
      {problem && <p className="sh-discussion-problem">{problem}</p>}
      {guests.size > 0 && (
        <div className="sh-sheet-guests">
          {[...guests].map(([id, who]) => (
            <Button
              key={id}
              size="sm"
              variant="outline"
              icon="undo"
              onClick={() => void act(sheetsApi.revertGuest(wikiId, name, id))}
            >
              Take back all of {who}'s changes
            </Button>
          ))}
        </div>
      )}
      {!edits.data.length && <p className="sh-special-empty">Nothing changed yet: every value is its default.</p>}
      <ul className="sh-sheet-edits">
        {edits.data.map((e) => (
          <EditRow key={e.id} edit={e} onUndo={() => void act(sheetsApi.undo(wikiId, name, e.id))} />
        ))}
      </ul>
    </section>
  );
}

const shown = (v: SheetEdit["value"]) => (v === null ? "the default" : JSON.stringify(v));

function EditRow({ edit, onUndo }: { edit: SheetEdit; onUndo: () => void }) {
  return (
    <li>
      <time dateTime={edit.at}>{ago(edit.at)}</time>
      <strong>{edit.name}</strong>
      <span>
        {edit.row} · {edit.column}: {shown(edit.prev)} → {shown(edit.value)}
      </span>
      {edit.exported && <Badge>Exported</Badge>}
      <Button size="sm" variant="ghost" icon="undo" onClick={onUndo}>
        Undo
      </Button>
    </li>
  );
}

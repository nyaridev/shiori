// Every data sheet of a wiki (ADR-0010), at `_/sheets`. Agents make them; this lists them, and what's wrong with any
// file that can't be read.
import { Link } from "react-router";
import { useLive } from "../lib/live.ts";
import { useResource } from "../lib/useResource.ts";
import { Badge } from "../ui/index.ts";
import { specialHref } from "../wiki/PageHead.tsx";
import { sheetsApi } from "./api.ts";
import "./sheets.css";

export function Sheets({ wikiId }: { wikiId: string }) {
  const sheets = useResource(`sheets:${wikiId}`, () => sheetsApi.list(wikiId));
  const { reload } = sheets;
  useLive((e) => {
    if (e.type === "pages" && e.wiki === wikiId) reload();
  });
  if (sheets.error) return <p className="sh-special-empty">Couldn't load the sheets: {sheets.error.message}</p>;
  if (!sheets.data) return null;
  if (!sheets.data.length)
    return (
      <p className="sh-special-empty">
        No sheets yet. Ask an agent for one (“make a sheet of every mob's health and attack”): it writes
        <code> sheets/&lt;name&gt;.json</code> with <code>pnpm shiori sheet &lt;wiki&gt; new &lt;name&gt;</code>.
      </p>
    );
  return (
    <ul className="sh-boards-list">
      {sheets.data.map((s) => (
        <li key={s.name}>
          <Link to={specialHref(wikiId, "sheets", s.name)} className="sh-boards-card">
            <span className="sh-boards-name">{s.title}</span>
            <span className="sh-boards-meta">
              sheets/{s.name}.json
              {s.problems ? <Badge tone="warn">Has problems</Badge> : <span>{s.rows} rows</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

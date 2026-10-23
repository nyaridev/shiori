// `::sheet{name="mobs"}` on a page (ADR-0010): the sheet, editable for the owner, with a link to its own page. Guests
// on a wiki link don't get sheets (a sheet is shared by its own link), so for them it says so.
import { Link } from "react-router";
import { useGuest } from "../guest/GuestContext.ts";
import { ApiError } from "../lib/api.ts";
import { specialHref } from "../wiki/PageHead.tsx";
import { sheetsApi } from "./api.ts";
import { useSheet } from "./SheetPage.tsx";
import { SheetTable } from "./SheetTable.tsx";

export function SheetBlock({ wikiId, name }: { wikiId: string; name: string }) {
  const guest = useGuest();
  if (guest) return <p className="sh-block-empty">A data sheet is here; it's shared with its own link.</p>;
  return <OwnerSheet wikiId={wikiId} name={name} />;
}

function OwnerSheet({ wikiId, name }: { wikiId: string; name: string }) {
  const sheet = useSheet(wikiId, name);
  if (sheet.error)
    return (
      <p className="sh-block-empty">
        {sheet.error instanceof ApiError && sheet.error.status === 404
          ? `There's no sheet “${name}” in this wiki.`
          : `The sheet “${name}” can't be read: \`pnpm shiori check\` says why.`}
      </p>
    );
  if (!sheet.data) return null;
  return (
    <figure className="sh-sheet-block">
      <SheetTable view={sheet.data} onSet={sheetsApi.set(wikiId, name)} />
      <figcaption>
        <Link to={specialHref(wikiId, "sheets", name)}>{sheet.data.title}</Link>: its history, and sharing it
      </figcaption>
    </figure>
  );
}

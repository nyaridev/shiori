// What a guest sees through a sheet link (ADR-0010): one sheet, in the wiki's colors, and nothing of the wiki. On an
// edit link they change the editable values; every value shows its default and who changed it.
import { useCallback, useEffect, useState } from "react";
import type { SheetView } from "../../shared/sheet.ts";
import type { Theme } from "../../shared/theme.ts";
import { useGuest } from "../guest/GuestContext.ts";
import { ApiError } from "../lib/api.ts";
import { poll } from "../lib/live.ts";
import { useTheme } from "../lib/useTheme.ts";
import { guestSheetApi } from "./api.ts";
import { SheetTable } from "./SheetTable.tsx";
import "./sheets.css";

export function GuestSheet({ onEnded }: { onEnded: (status: number) => void }) {
  const guest = useGuest();
  const [data, setData] = useState<{ sheet: SheetView; wiki: { title: string; theme: Theme } } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useTheme(data?.wiki.theme);

  const load = useCallback(async () => {
    try {
      setData(await guestSheetApi.view());
      setProblem(null);
    } catch (e) {
      if (e instanceof ApiError && [401, 403, 410].includes(e.status)) onEnded(e.status);
      else setProblem("This sheet can't be opened right now. Try again in a moment.");
    }
  }, [onEnded]);

  // The first answer loads the sheet; every later one means it changed.
  useEffect(() => poll("/api/sheet/changes", () => void load(), onEnded), [load, onEnded]);
  useEffect(() => {
    if (data) document.title = `${data.sheet.title} · ${data.wiki.title}`;
  }, [data]);

  if (!data) return <main className="sh-guest">{problem && <p className="sh-guest-text">{problem}</p>}</main>;
  const { sheet, wiki } = data;
  return (
    <main className="sh-tester sh-tester-wide">
      <header className="sh-tester-head">
        <p className="sh-guest-kicker">{wiki.title} · data sheet</p>
        <h1 className="sh-tester-title">{sheet.title}</h1>
        {sheet.description && <p className="sh-guest-text">{sheet.description}</p>}
        <p className="sh-guest-text">
          {sheet.canEdit
            ? "Change the values in the fields. Each one shows its default, and you can put it back. Changes are saved at once and everyone sees who made them."
            : "You can look at the values; this link doesn't let you change them."}{" "}
          You're <strong>{guest?.guest?.name}</strong>.
        </p>
      </header>
      {problem && <p className="sh-discussion-problem">{problem}</p>}
      <SheetTable view={sheet} onSet={sheet.canEdit ? guestSheetApi.set : undefined} />
    </main>
  );
}

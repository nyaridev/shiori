// A data sheet as a table people tune (ADR-0010): rows in groups, editable cells as inputs of their column's type,
// each with its default beside it and a way back to it. Values are checked here first (shared/sheet.ts) so mistakes
// show at once, but only the server's check counts. A change made on a value someone else just changed comes back
// as a conflict, and the cell shows theirs.
import { type KeyboardEvent, useEffect, useState } from "react";
import { type Cell, checkValue, type SheetCell, type SheetColumn, type SheetView } from "../../shared/sheet.ts";
import { ApiError } from "../lib/api.ts";
import { ago } from "../lib/time.ts";
import { Checkbox, cx, IconButton, Input, ScrollArea, Select } from "../ui/index.ts";
import type { SetCell } from "./api.ts";
import "./sheets.css";

const show = (v: Cell, col: SheetColumn) =>
  v === null
    ? "—"
    : typeof v === "boolean"
      ? v
        ? "Yes"
        : "No"
      : col.type === "number" && col.unit
        ? `${v} ${col.unit}`
        : String(v);

export function SheetTable({ view, onSet }: { view: SheetView; onSet?: SetCell }) {
  // Cells as this table last heard from the server; a fresh view from the server replaces them.
  const [cells, setCells] = useState(() => cellsOf(view));
  useEffect(() => setCells(cellsOf(view)), [view]);
  const editable = view.canEdit && !!onSet;

  const groups = new Map<string, SheetView["rows"]>();
  for (const row of view.rows) {
    const g = view.groupBy ? String(row.cells[view.groupBy]?.value ?? "") : "";
    groups.set(g, [...(groups.get(g) ?? []), row]);
  }
  const cols = view.columns;

  return (
    <ScrollArea axis="x" label={view.title} className="sh-sheet-scroll">
      <table className="sh-sheet">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.id} scope="col" title={c.hint} data-type={c.type}>
                {c.label ?? c.id}
                {c.type === "number" && c.unit && <span className="sh-sheet-unit"> ({c.unit})</span>}
              </th>
            ))}
          </tr>
        </thead>
        {[...groups].map(([group, rows]) => (
          <tbody key={group || "-"}>
            {view.groupBy && (
              <tr className="sh-sheet-group">
                <th colSpan={cols.length} scope="rowgroup">
                  {group || "Other"}
                </th>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key}>
                {cols.map((c) => {
                  const cell = cells.get(`${row.key}\n${c.id}`) ?? row.cells[c.id];
                  return editable && c.editable ? (
                    <EditCell
                      key={c.id}
                      col={c}
                      cell={cell}
                      onSet={async (value) => {
                        const id = `${row.key}\n${c.id}`;
                        try {
                          const next = await (onSet as SetCell)({
                            row: row.key,
                            column: c.id,
                            value,
                            base: cell.version,
                          });
                          setCells((m) => new Map(m).set(id, next));
                          return null;
                        } catch (e) {
                          // Someone changed it meanwhile: show theirs, and say so.
                          const data = e instanceof ApiError ? (e.data as { cell?: SheetCell } | null) : null;
                          if (e instanceof ApiError && e.status === 409 && data?.cell) {
                            setCells((m) => new Map(m).set(id, data.cell as SheetCell));
                            return `${data.cell.by?.name ?? "Someone"} changed it just now.`;
                          }
                          return e instanceof ApiError ? e.detail : "Couldn't save.";
                        }
                      }}
                    />
                  ) : (
                    <td key={c.id} data-type={c.type} data-changed={cell.by ? "" : undefined} title={byline(cell)}>
                      {show(cell.value, c)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </ScrollArea>
  );
}

function cellsOf(view: SheetView) {
  return new Map(view.rows.flatMap((r) => Object.entries(r.cells).map(([c, cell]) => [`${r.key}\n${c}`, cell])));
}

const byline = (cell: SheetCell) => (cell.by ? `Changed by ${cell.by.name}, ${ago(cell.by.at)}` : undefined);

/** An editable cell: an input of its column's type, its default, and Reset. `onSet` answers a problem, or null. */
function EditCell({
  col,
  cell,
  onSet,
}: {
  col: SheetColumn;
  cell: SheetCell;
  onSet: (value: Cell) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(() => String(cell.value ?? ""));
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(String(cell.value ?? "")), [cell.value]);
  const changed = cell.value !== cell.default;

  const save = async (raw: Cell) => {
    if (raw !== null) {
      const checked = checkValue(col, raw);
      if ("error" in checked) {
        setProblem(`Should be ${checked.error}.`);
        return;
      }
      if (checked.value === cell.value) {
        setProblem(null);
        setDraft(String(cell.value ?? ""));
        return;
      }
      raw = checked.value;
    }
    setSaving(true);
    setProblem(await onSet(raw));
    setSaving(false);
  };
  // A number or text field saves when it's left or on Enter; Escape puts it back.
  const commit = () => {
    if (draft === String(cell.value ?? "")) return setProblem(null);
    void save(col.type === "number" ? (draft.trim() === "" ? Number.NaN : Number(draft)) : draft);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setDraft(String(cell.value ?? ""));
      setProblem(null);
    }
  };

  return (
    <td
      className={cx("sh-sheet-edit", saving && "is-saving")}
      data-type={col.type}
      data-changed={changed ? "" : undefined}
      data-problem={problem ? "" : undefined}
      title={byline(cell)}
    >
      <div className="sh-sheet-field">
        {col.type === "bool" ? (
          <Checkbox checked={cell.value === true} onChange={(on: boolean) => void save(on)}>
            {cell.value === true ? "Yes" : "No"}
          </Checkbox>
        ) : col.type === "choice" ? (
          <Select
            label={col.label ?? col.id}
            value={typeof cell.value === "string" ? cell.value : undefined}
            onChange={(v) => void save(v)}
            options={col.options.map((o) => ({ value: o, label: o }))}
          />
        ) : (
          <Input
            type={col.type === "number" ? "number" : "text"}
            inputMode={col.type === "number" ? "decimal" : undefined}
            min={col.type === "number" ? col.min : undefined}
            max={col.type === "number" ? col.max : undefined}
            step={col.type === "number" ? (col.step ?? 1) : undefined}
            maxLength={col.type === "text" ? (col.maxLength ?? 200) : undefined}
            value={draft}
            aria-label={col.label ?? col.id}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={keys}
          />
        )}
        {changed && (
          <IconButton
            icon="undo"
            size="sm"
            label={`Back to the default (${show(cell.default, col)})`}
            onClick={() => void save(null)}
          />
        )}
      </div>
      <span className="sh-sheet-default">
        {problem ?? (changed ? `default ${show(cell.default, col)}${cell.by ? ` · ${cell.by.name}` : ""}` : " ")}
      </span>
    </td>
  );
}

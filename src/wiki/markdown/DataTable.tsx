// A data table (ADR-0008): `::table` / `:::table` rendered as an ordinary table (server/markdown/tables.ts) that
// people sort by clicking a column and narrow with a filter, with a foot of stats over the rows shown when the page
// asks for one. It reorders the table's own rows, so links, badges and wikilinks in the cells stay as they are.
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
  useMemo,
  useState,
} from "react";
import { Icon, Input } from "../../ui/index.ts";
import {
  compareCells,
  formatStat,
  isNumeric,
  matches,
  numberOf,
  parseFilter,
  type Stat,
  stat,
  statsOf,
} from "./tableRows.ts";
import "./data.css";

type El = ReactElement<{ children?: ReactNode; style?: object }>;

const elements = (node: ReactNode): El[] => Children.toArray(node).filter(isValidElement) as El[];

/** A cell's text, from the React elements the server's hast became. */
const textOf = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join("")
      : isValidElement(node)
        ? textOf((node.props as { children?: ReactNode }).children)
        : "";

const loose = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/** The rows of the table the server rendered: its header cells and its body rows, each with its cells' text. */
function readTable(children: ReactNode) {
  const table = elements(children)[0];
  const parts = elements(table?.props.children);
  const head = elements(parts.find((p) => p.type === "thead")?.props.children)[0];
  const headCells = elements(head?.props.children);
  const body = elements(parts.find((p) => p.type === "tbody")?.props.children);
  const rows = body.map((el, index) => ({ el, index, cells: elements(el.props.children).map((c) => textOf(c)) }));
  return { headCells, columns: headCells.map((c) => textOf(c).trim()), rows };
}

const LABELS: Record<Stat, string> = { sum: "Total", avg: "Average", min: "Lowest", max: "Highest" };

/** How many rows show a filter box. */
const FILTER_FROM = 6;

export function DataTableEl({
  sort,
  stats,
  caption,
  children,
}: {
  sort?: string;
  stats?: string;
  caption?: string;
  children?: ReactNode;
}) {
  const { headCells, columns, rows } = useMemo(() => readTable(children), [children]);
  const numeric = useMemo(() => columns.map((_, i) => isNumeric(rows.map((r) => r.cells[i] ?? ""))), [columns, rows]);
  const [order, setOrder] = useState<{ column: number; dir: 1 | -1 } | null>(() => {
    if (!sort) return null;
    const column = columns.findIndex((c) => loose(c) === loose(sort.replace(/^-/, "")));
    return column < 0 ? null : { column, dir: sort.startsWith("-") ? -1 : 1 };
  });
  const [filter, setFilter] = useState("");
  const filterId = useId();

  const terms = useMemo(() => parseFilter(filter, columns), [filter, columns]);
  const shown = useMemo(() => {
    const kept = rows.filter((r) => matches(r.cells, terms));
    if (!order) return kept;
    return [...kept].sort(
      (a, b) =>
        compareCells(a.cells[order.column] ?? "", b.cells[order.column] ?? "", numeric[order.column], order.dir) ||
        a.index - b.index,
    );
  }, [rows, terms, order, numeric]);
  const foot = statsOf(stats);

  // A column's header: first ascending, then descending, then the page's own order.
  const toggle = (column: number) =>
    setOrder((o) => (o?.column !== column ? { column, dir: 1 } : o.dir === 1 ? { column, dir: -1 } : null));

  if (!headCells.length) return <>{children}</>;
  return (
    <figure className="sh-data">
      {(caption || rows.length >= FILTER_FROM) && (
        <div className="sh-data-bar">
          {caption && <figcaption className="sh-data-caption">{caption}</figcaption>}
          {rows.length >= FILTER_FROM && (
            <div className="sh-data-filter">
              <label htmlFor={filterId} className="sh-sr-only">
                Filter the rows
              </label>
              <Icon name="search" size={14} />
              <Input
                id={filterId}
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Filter… ${numeric.some(Boolean) ? `${columns[numeric.indexOf(true)]}>10` : "words"}`}
                spellCheck={false}
              />
              <span className="sh-data-count" aria-live="polite">
                {shown.length === rows.length ? `${rows.length} rows` : `${shown.length} of ${rows.length}`}
              </span>
            </div>
          )}
        </div>
      )}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a region that scrolls must be reachable by keyboard. */}
      <section className="sh-table-wrap" tabIndex={0} aria-label={caption ?? "Table"}>
        <table>
          <thead>
            <tr>
              {headCells.map((th, i) => {
                const dir = order?.column === i ? order.dir : 0;
                return cloneElement(
                  th,
                  {
                    key: columns[i] || i,
                    "aria-sort": dir === 1 ? "ascending" : dir === -1 ? "descending" : "none",
                    "data-numeric": numeric[i] || undefined,
                  } as object,
                  <button
                    type="button"
                    className="sh-data-sort"
                    onClick={() => toggle(i)}
                    title={`Sort by ${columns[i]}`}
                  >
                    <span>{th.props.children}</span>
                    <Icon name="chevronDown" size={12} />
                  </button>,
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) =>
              cloneElement(
                r.el,
                { key: r.index },
                elements(r.el.props.children).map((td, i) =>
                  cloneElement(td, { key: columns[i] || i, "data-numeric": numeric[i] || undefined } as object),
                ),
              ),
            )}
            {!shown.length && (
              <tr className="sh-data-none">
                <td colSpan={columns.length}>No row matches “{filter}”.</td>
              </tr>
            )}
          </tbody>
          {foot.length > 0 && (
            <tfoot>
              {foot.map((kind) => (
                <tr key={kind}>
                  {columns.map((column, i) => {
                    const values = shown.map((r) => numberOf(r.cells[i] ?? "")).filter((n): n is number => n !== null);
                    const value = i > 0 && numeric[i] ? stat(kind, values) : null;
                    return (
                      <td key={column || i} data-numeric={numeric[i] || undefined}>
                        {i === 0 ? (
                          <span className="sh-data-stat">{LABELS[kind]}</span>
                        ) : value === null ? (
                          ""
                        ) : (
                          formatStat(value)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </section>
    </figure>
  );
}

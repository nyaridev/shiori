// A line diff (shared/diff.ts) as git shows one: the old and the new line numbers, removed lines in red and added in
// green, the words that changed inside a changed line marked, and the unchanged stretches between hunks folded.
import { Fragment } from "react";
import { type DiffLine, diffWords, type FileDiff, type Part } from "../../../shared/diff.ts";
import { ScrollArea } from "../../ui/index.ts";

/** Pairs each removed line with the added line in the same place of a change, to mark the words that differ. */
function paired(lines: DiffLine[]): Map<DiffLine, Part[]> {
  const parts = new Map<DiffLine, Part[]>();
  for (let i = 0; i < lines.length; ) {
    if (lines[i].kind !== "del") {
      i++;
      continue;
    }
    const dels: DiffLine[] = [];
    while (lines[i]?.kind === "del") dels.push(lines[i++]);
    const adds: DiffLine[] = [];
    while (lines[i]?.kind === "add") adds.push(lines[i++]);
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const { removed, added } = diffWords(dels[k].text, adds[k].text);
      // A line rewritten whole reads better without marks.
      if (added.some((p) => !p.changed && p.text.trim())) {
        parts.set(dels[k], removed);
        parts.set(adds[k], added);
      }
    }
  }
  return parts;
}

function Text({ line, parts }: { line: DiffLine; parts?: Part[] }) {
  if (!parts) return <>{line.text || " "}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.changed ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one line never move.
          <mark key={i} className="sh-diff-word">
            {p.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above.
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

const SIGN = { same: " ", add: "+", del: "−" } as const;

function Skipped({ count }: { count: number }) {
  if (!count) return null;
  return (
    <tr className="sh-diff-skip">
      <td colSpan={4}>
        {count} unchanged line{count === 1 ? "" : "s"}
      </td>
    </tr>
  );
}

export function DiffView({ diff, empty = "Nothing changed." }: { diff: FileDiff; empty?: string }) {
  if (!diff.hunks.length) return <p className="sh-diff-empty">{empty}</p>;
  return (
    <ScrollArea axis="x" label="Changes" className="sh-diff">
      <table>
        <tbody>
          {diff.hunks.map((hunk) => {
            const parts = paired(hunk.lines);
            return (
              <Fragment key={`${hunk.lines[0].old ?? 0}:${hunk.lines[0].new ?? 0}`}>
                <Skipped count={hunk.skipped} />
                {hunk.lines.map((line) => (
                  <tr
                    key={`${line.kind}:${line.old ?? ""}:${line.new ?? ""}`}
                    className="sh-diff-line"
                    data-kind={line.kind}
                  >
                    <td className="sh-diff-no">{line.old ?? ""}</td>
                    <td className="sh-diff-no">{line.new ?? ""}</td>
                    <td
                      className="sh-diff-sign"
                      aria-label={line.kind === "same" ? undefined : line.kind === "add" ? "added" : "removed"}
                    >
                      {SIGN[line.kind]}
                    </td>
                    <td className="sh-diff-text">
                      <Text line={line} parts={parts.get(line)} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
          <Skipped count={diff.skippedAfter} />
        </tbody>
      </table>
    </ScrollArea>
  );
}

/** "+12 −3", in the tones of what was added and removed. */
export function Churn({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="sh-churn">
      <span data-kind="add">+{added}</span>
      <span data-kind="del">−{removed}</span>
    </span>
  );
}

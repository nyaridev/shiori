// One test board for the owner (ADR-0010), at `_/boards/<uid>`: how it stands at a glance (new, planned, fixed,
// testers), the reports as rows filtered by kind and status, each one's status and note for the tester; who sees
// what, closing it, and the Share button that makes a tester link. A board goes to the trash from its card on
// `_/boards` (ADR-0014); a trashed one opened from there shows a banner to restore it or delete it now.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { REPORT_KINDS, type Report, type ReportKind, type ReportStatus } from "../../shared/api.ts";
import { useLive } from "../lib/live.ts";
import { useResource } from "../lib/useResource.ts";
import { ShareDialog } from "../sharing/ShareDialog.tsx";
import { Badge, Button, cx, Select } from "../ui/index.ts";
import { specialHref } from "../wiki/PageHead.tsx";
import { PageIcon } from "../wiki/PageIcon.tsx";
import { boardsApi } from "./api.ts";
import { VISIBILITY } from "./Boards.tsx";
import { KIND, STATUS } from "./labels.ts";
import { KindMark, ReportCard } from "./ReportCard.tsx";
import { DeleteForever, purgeText } from "./Trash.tsx";
import "./boards.css";

/** Which reports show: still to do (new and planned), one status, or all. */
type Show = "todo" | ReportStatus | "all";

export function BoardPage({ wikiId, uid, onTitle }: { wikiId: string; uid: string; onTitle?: (t: string) => void }) {
  const res = useResource(`board:${wikiId}:${uid}`, () => boardsApi.reports(wikiId, uid));
  const { reload } = res;
  useLive((e) => {
    if (e.type === "threads" && e.wiki === wikiId) reload();
  });
  const [kind, setKind] = useState<ReportKind | "all">("all");
  const [show, setShow] = useState<Show>("todo");
  const navigate = useNavigate();
  useEffect(() => {
    if (res.data) onTitle?.(res.data.board.name);
  }, [res.data, onTitle]);

  if (res.error) return <p className="sh-special-empty">Couldn't load the board: {res.error.message}</p>;
  if (!res.data) return <p className="sh-special-empty">Loading…</p>;
  const { board, reports } = res.data;
  const shown = reports.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      (show === "all" || (show === "todo" ? !STATUS[r.status].done : r.status === show)),
  );
  const act = async <T,>(p: Promise<T>) => {
    await p;
    reload();
  };
  const count = (f: (r: Report) => boolean) => reports.filter(f).length;
  const testers = new Set(reports.map((r) => r.guestId ?? r.name)).size;
  const done = count((r) => STATUS[r.status].done);

  return (
    <div className="sh-board">
      {board.trashedAt && (
        <div className="sh-trash-banner" role="status">
          <span className="sh-trash-confirm-text">
            <strong>In the trash.</strong> Its links don't work and it takes no reports. {purgeText(board.trashedAt)},
            with its reports and their pictures.
          </span>
          <Button
            size="sm"
            variant="solid"
            icon="undo"
            onClick={() => void act(boardsApi.change(wikiId, uid, { trashed: false }))}
          >
            Restore
          </Button>
          <DeleteForever
            wikiId={wikiId}
            board={{ ...board, counts: { total: reports.length, new: 0, done: 0 } }}
            onDone={() => navigate(specialHref(wikiId, "boards"))}
          />
        </div>
      )}
      <div className="sh-board-settings">
        <span className="sh-board-setting">
          <PageIcon icon="people" />
          <Select
            label="Who sees what"
            value={board.visibility}
            onChange={(visibility) => void act(boardsApi.change(wikiId, uid, { visibility }))}
            options={VISIBILITY.map((v) => ({ value: v.value, label: v.label }))}
          />
        </span>
        {board.closedAt ? <Badge>Closed: takes no new reports</Badge> : <Badge tone="good">Open</Badge>}
        <span className="sh-board-fact">
          <PageIcon icon="person" /> {testers} tester{testers === 1 ? "" : "s"}
        </span>
        <span className="sh-board-spacer" />
        <Button
          variant="ghost"
          icon={board.closedAt ? "undo" : "block"}
          onClick={() => void act(boardsApi.change(wikiId, uid, { closed: !board.closedAt }))}
        >
          {board.closedAt ? "Open again" : "Close board"}
        </Button>
        {!board.closedAt && !board.trashedAt && (
          <ShareDialog
            wikiId={wikiId}
            title={board.name}
            target={{ kind: "board", id: board.uid, title: board.name }}
            trigger={
              <Button variant="solid" icon="share">
                Share with testers
              </Button>
            }
          />
        )}
      </div>

      <fieldset className="sh-board-stats">
        <legend className="sh-sr-only">Show reports</legend>
        <Stat label="To do" value={reports.length - done} on={show === "todo"} onClick={() => setShow("todo")} />
        <Stat
          label="New"
          value={count((r) => r.status === "new")}
          tone="accent"
          on={show === "new"}
          onClick={() => setShow("new")}
        />
        <Stat
          label="Planned"
          value={count((r) => r.status === "planned")}
          tone="warn"
          on={show === "planned"}
          onClick={() => setShow("planned")}
        />
        <Stat
          label="Fixed"
          value={count((r) => r.status === "fixed")}
          tone="good"
          on={show === "fixed"}
          onClick={() => setShow("fixed")}
        />
        <Stat label="All reports" value={reports.length} on={show === "all"} onClick={() => setShow("all")} />
      </fieldset>
      {reports.length > 0 && (
        <div
          className="sh-board-progress"
          role="img"
          aria-label={`${done} of ${reports.length} reports done with`}
          title={`${done} of ${reports.length} done with`}
        >
          <span style={{ width: `${(done / reports.length) * 100}%` }} />
        </div>
      )}

      <fieldset className="sh-board-kinds">
        <legend className="sh-sr-only">Kind</legend>
        <KindChip on={kind === "all"} onClick={() => setKind("all")} label="Every kind" n={reports.length} />
        {REPORT_KINDS.map((k) => (
          <KindChip
            key={k}
            kind={k}
            on={kind === k}
            onClick={() => setKind(k)}
            label={`${KIND[k].label}s`}
            n={count((r) => r.kind === k)}
          />
        ))}
      </fieldset>

      {!shown.length && (
        <div className="sh-board-empty">
          <PageIcon icon={reports.length ? "magnifier" : "bug"} />
          <p>
            {reports.length
              ? "Nothing here with these filters."
              : "No reports yet. Share the board with your testers, and what they find lands here."}
          </p>
        </div>
      )}
      <div className="sh-board-reports">
        {shown.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            pictureUrl={boardsApi.pictureUrl(wikiId)}
            owner={{
              triage: (change) => act(boardsApi.triage(wikiId, uid, r.id, change)),
              remove: () => act(boardsApi.remove(wikiId, uid, r.id)),
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  on,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "accent" | "warn" | "good";
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cx("sh-board-stat", on && "is-on")}
      data-tone={tone}
      aria-pressed={on}
      onClick={onClick}
    >
      <span className="sh-board-stat-value">{value}</span>
      <span className="sh-board-stat-label">{label}</span>
    </button>
  );
}

function KindChip({
  kind,
  label,
  n,
  on,
  onClick,
}: {
  kind?: ReportKind;
  label: string;
  n: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={cx("sh-kind-chip", on && "is-on")} aria-pressed={on} onClick={onClick}>
      {kind && <KindMark kind={kind} />}
      {label}
      <span className="sh-kind-chip-n">{n}</span>
    </button>
  );
}

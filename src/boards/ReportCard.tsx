// One tester's report (ADR-0010), as a row that opens: its kind's icon, title, who and when, pictures and status;
// open, its details, pictures, the team's note and, for the owner, where it stands. The owner also hides or removes
// it; a tester changes or removes their own. The servers check the same rights.
import { useId, useState } from "react";
import {
  REPORT_KINDS,
  REPORT_LIMITS,
  REPORT_STATUSES,
  type Report,
  type ReportKind,
  type ReportStatus,
} from "../../shared/api.ts";
import { ago } from "../lib/time.ts";
import {
  Badge,
  Button,
  cx,
  Icon,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Segmented,
  Select,
  Textarea,
} from "../ui/index.ts";
import { PageIcon } from "../wiki/PageIcon.tsx";
import { KIND, STATUS } from "./labels.ts";

export interface OwnerActions {
  triage: (change: { status?: ReportStatus; note?: string; hidden?: boolean }) => Promise<unknown>;
  remove: () => Promise<unknown>;
}
export interface TesterActions {
  edit: (change: { kind?: ReportKind; title?: string; body?: string }) => Promise<unknown>;
  remove: () => Promise<unknown>;
}

/** A kind's icon in a small tinted tile. */
export function KindMark({ kind, size = "md" }: { kind: ReportKind; size?: "md" | "lg" }) {
  return (
    <span className="sh-kind-mark" data-kind={kind} data-size={size} aria-hidden="true">
      <PageIcon icon={KIND[kind].icon} />
    </span>
  );
}

export function ReportCard({
  report,
  pictureUrl,
  owner,
  tester,
}: {
  report: Report;
  pictureUrl: (file: string, w?: number) => string;
  /** The owner's app. */
  owner?: OwnerActions;
  /** A tester's own report. */
  tester?: TesterActions;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const details = useId();
  const kind = KIND[report.kind];
  const status = STATUS[report.status];
  const remove = owner?.remove ?? tester?.remove;
  const who = report.mine ? "You" : (report.name ?? (report.author === "agent" ? "Agent" : "Host"));
  const pictures = report.images?.length ?? 0;
  const show = (then?: () => void) => () => {
    setOpen(true);
    then?.();
  };

  return (
    <article
      className={cx("sh-report", open && "is-open")}
      data-status={report.status}
      data-done={status.done || undefined}
      data-hidden={report.hidden || undefined}
    >
      <div className="sh-report-row">
        <button
          type="button"
          className="sh-report-main"
          aria-expanded={open}
          aria-controls={details}
          onClick={() => setOpen((o) => !o)}
        >
          <KindMark kind={report.kind} />
          <span className="sh-report-text">
            <span className="sh-report-title">{report.title}</span>
            <span className="sh-report-meta">
              <span>{kind.label}</span>
              <span aria-hidden="true">·</span>
              <span>{who}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={report.createdAt}>{ago(report.createdAt)}</time>
              {report.editedAt && <span>· edited</span>}
              {pictures > 0 && (
                <span className="sh-report-count" title={`${pictures} picture${pictures === 1 ? "" : "s"}`}>
                  <PageIcon icon="frame" /> {pictures}
                </span>
              )}
              {report.note && !open && (
                <span className="sh-report-count" title="The team answered">
                  <Icon name="comment" size={12} /> reply
                </span>
              )}
            </span>
          </span>
          {report.hidden && <Badge tone="warn">Hidden</Badge>}
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="sh-report-chevron" aria-hidden="true">
            <Icon name="chevronDown" size={16} />
          </span>
        </button>
        {(tester || owner) && (
          <Menu>
            <MenuTrigger asChild>
              <IconButton icon="dots" label="Actions for this report" size="sm" className="sh-report-menu" />
            </MenuTrigger>
            <MenuContent align="end">
              {tester && (
                <MenuItem icon="edit" onSelect={show(() => setEditing(true))}>
                  Edit
                </MenuItem>
              )}
              {owner && (
                <MenuItem
                  icon={report.hidden ? "eye" : "eyeOff"}
                  onSelect={() => void owner.triage({ hidden: !report.hidden })}
                >
                  {report.hidden ? "Show to testers again" : "Hide from testers"}
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem icon="trash" danger onSelect={show(() => setConfirming(true))}>
                Remove
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </div>

      {open && (
        <div id={details} className="sh-report-details">
          {confirming && remove && (
            <div className="sh-thread-confirm" role="alert">
              <span className="sh-thread-confirm-text">Remove this report{owner ? " for everyone" : ""}?</span>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button size="sm" variant="ghost" icon="trash" onClick={() => void remove()}>
                Remove
              </Button>
            </div>
          )}
          {editing && tester ? (
            <EditReport report={report} onSave={tester.edit} onDone={() => setEditing(false)} />
          ) : report.body ? (
            <p className="sh-report-body">{report.body}</p>
          ) : (
            <p className="sh-report-body sh-report-quiet">No details.</p>
          )}
          {pictures > 0 && (
            <ul className="sh-report-pictures">
              {report.images?.map((f) => (
                <li key={f}>
                  <a href={pictureUrl(f)} target="_blank" rel="noopener" title="Open the picture">
                    <img src={pictureUrl(f, 480)} alt="Attached to this report" loading="lazy" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {owner ? (
            <Triage report={report} owner={owner} />
          ) : (
            report.note && (
              <div className="sh-report-note">
                <span className="sh-report-note-label">From the team</span>
                <p>{report.note}</p>
              </div>
            )
          )}
        </div>
      )}
    </article>
  );
}

/** The owner's row: where the report stands, and a note the tester sees. */
function Triage({ report, owner }: { report: Report; owner: OwnerActions }) {
  const [note, setNote] = useState(report.note);
  const save = () => {
    if (note.trim() !== report.note) void owner.triage({ note: note.trim() });
  };
  return (
    <div className="sh-report-triage">
      <div className="sh-report-triage-field">
        <span>Where it stands</span>
        <Select
          label="Where it stands"
          value={report.status}
          onChange={(status) => void owner.triage({ status })}
          options={REPORT_STATUSES.map((s) => ({ value: s, label: STATUS[s].label }))}
        />
      </div>
      <div className="sh-report-triage-field sh-report-triage-note">
        <span>Note for the tester</span>
        <Input
          value={note}
          maxLength={2000}
          placeholder="“Fixed in 0.4”, “Thanks, planned for the next update”"
          aria-label="Note for the tester"
          onChange={(e) => setNote(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
      </div>
    </div>
  );
}

function EditReport({ report, onSave, onDone }: { report: Report; onSave: TesterActions["edit"]; onDone: () => void }) {
  const [kind, setKind] = useState<ReportKind>(report.kind);
  const [title, setTitle] = useState(report.title);
  const [body, setBody] = useState(report.body);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async () => {
    try {
      await onSave({ kind, title: title.trim(), body: body.trim() });
      onDone();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  };
  return (
    <div className="sh-report-edit">
      <Segmented
        label="Kind"
        value={kind}
        onChange={setKind}
        options={REPORT_KINDS.map((k) => ({ value: k, label: KIND[k].label }))}
      />
      <Input
        value={title}
        maxLength={REPORT_LIMITS.title}
        aria-label="Title"
        onChange={(e) => setTitle(e.target.value)}
      />
      <Textarea rows={3} value={body} aria-label="Details" onChange={(e) => setBody(e.target.value)} />
      <div className="sh-thread-actions">
        {problem && <span className="sh-discussion-problem">{problem}</span>}
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="soft" icon="check" disabled={!title.trim()} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}

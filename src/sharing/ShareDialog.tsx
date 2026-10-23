// The owner's Share dialog (ADR-0003): make a link to one wiki, copy it, and watch who came through it. The links,
// guests and activity live in the server's memory; the dialog asks for them while it's open. Opened on a test board
// or a data sheet (ADR-0010), it makes links to that alone: testers', or a sheet's to look at or to change.
import { type ReactNode, useEffect, useId, useState } from "react";
import type { ShareDuration, ShareInfo, ShareKind, SharesState, TunnelStatus } from "../../shared/api.ts";
import { api } from "../lib/api.ts";
import { isGuest } from "../lib/base.ts";
import { ago, left } from "../lib/time.ts";
import { Badge, Button, Callout, Dialog, DialogContent, DialogTrigger, Input, Segmented, Select } from "../ui/index.ts";
import { useShares } from "./useShares.ts";
import "./share.css";

const DURATIONS: { value: ShareDuration; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "session", label: "Until Shiori closes" },
];
const KINDS: { value: ShareKind; label: string }[] = [
  { value: "view", label: "Can read" },
  { value: "comment", label: "Can read and comment" },
];
const SHEET_RIGHTS: { value: "look" | "edit"; label: string }[] = [
  { value: "look", label: "Can look" },
  { value: "edit", label: "Can change values" },
];

/** What a link opens, when it isn't the whole wiki: one test board or one data sheet. */
export interface ShareTargetOf {
  kind: "board" | "sheet";
  id: string;
  title: string;
}

/** A link's badge: what it lets people do. */
function kindLabel(s: ShareInfo): { label: string; tone: "accent" | "neutral" } {
  if (s.kind === "board") return { label: `Test board · ${s.target?.title ?? ""}`, tone: "accent" };
  if (s.kind === "sheet")
    return {
      label: `Sheet · ${s.target?.title ?? ""}${s.edit ? " · can change" : ""}`,
      tone: s.edit ? "accent" : "neutral",
    };
  return s.kind === "comment" ? { label: "Read and comment", tone: "accent" } : { label: "Read", tone: "neutral" };
}
const WRITES: Record<ShareKind, [string, string]> = {
  view: ["comment", "comments"],
  comment: ["comment", "comments"],
  board: ["report", "reports"],
  sheet: ["change", "changes"],
};

/** The name the owner signs with for guests, remembered in this browser so it survives restarts. */
const HOST_KEY = "shiori.hostName";
const savedHost = () => {
  try {
    return localStorage.getItem(HOST_KEY) ?? "";
  } catch {
    return "";
  }
};
const saveHost = (name: string) => {
  try {
    localStorage.setItem(HOST_KEY, name);
  } catch {}
};

/** A Share button (`trigger`) and its dialog. Guests never get one. */
export function ShareDialog({
  wikiId,
  title,
  trigger,
  target,
}: {
  wikiId: string;
  title: string;
  trigger: ReactNode;
  /** A board or a sheet to share alone, without the wiki. */
  target?: ShareTargetOf;
}) {
  if (isGuest) return null;
  const description =
    target?.kind === "board"
      ? "Testers open the link and see only this board: they report bugs, changes and ideas, with pictures. Nothing else of the wiki."
      : target?.kind === "sheet"
        ? "People open the link and see only this sheet. Let them change values, or only look. Nothing else of the wiki."
        : "Friends open the link in their browser. The wiki stays on this PC, and links end when they expire or Shiori closes.";
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="lg" title={`Share ${target?.title ?? title}`} description={description}>
        <ShareBody wikiId={wikiId} target={target} />
      </DialogContent>
    </Dialog>
  );
}

function ShareBody({ wikiId, target }: { wikiId: string; target?: ShareTargetOf }) {
  const { state, unavailable, problem, act } = useShares();
  // The countdowns tick while the dialog is open.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (unavailable) return <Callout tone="warning">{unavailable}</Callout>;
  if (!state) return <p className="sh-share-quiet">Loading…</p>;

  // On a board or sheet: its own links. On the wiki: all of the wiki's, boards' and sheets' too.
  const mine = state.shares.filter((s) => s.wiki === wikiId && (!target || s.target?.id === target.id));
  const others = state.shares.length - mine.length;
  const up = state.tunnel.state === "up";
  return (
    <div className="sh-share">
      <TunnelNote tunnel={state.tunnel} active={state.shares.length > 0} onRetry={() => act(api.retryTunnel)} />
      <NewLink wikiId={wikiId} state={state} act={act} target={target} />
      {problem && <p className="sh-share-problem">{problem}</p>}
      {mine.length > 0 && (
        <section className="sh-share-links" aria-label="Active links">
          <h3 className="sh-share-heading">Active links</h3>
          {mine.map((s) => (
            <LinkCard key={s.id} share={s} up={up} now={now} act={act} />
          ))}
        </section>
      )}
      {state.shares.length > 0 && (
        <footer className="sh-share-foot">
          <span className="sh-share-quiet">
            {others > 0 && `${others} more link${others === 1 ? "" : "s"} elsewhere.`}
          </span>
          <Button variant="outline" size="sm" icon="block" onClick={() => void act(api.stopSharing)}>
            Stop all sharing
          </Button>
        </footer>
      )}
    </div>
  );
}

/** Where the tunnel is: links reach people outside this PC only while it's up. */
function TunnelNote({ tunnel, active, onRetry }: { tunnel: TunnelStatus; active: boolean; onRetry: () => void }) {
  const retry = active && (
    <Button size="sm" variant="soft" onClick={onRetry}>
      Try again
    </Button>
  );
  switch (tunnel.state) {
    case "missing":
      return (
        <Callout tone="warning" title="cloudflared isn't installed">
          <p>
            Links reach people outside this PC through a Cloudflare tunnel, which needs <code>cloudflared</code>.
            Install it, then try again:
          </p>
          <div className="sh-share-row">
            <code className="sh-share-command">{tunnel.install}</code>
            <CopyButton text={tunnel.install ?? ""} label="Copy" />
            {retry}
          </div>
        </Callout>
      );
    case "starting":
      return (
        <Callout tone="note" title="Opening a public address…">
          <p>Links work on this PC until the tunnel is up, usually in a few seconds.</p>
        </Callout>
      );
    case "failed":
      return (
        <Callout tone="danger" title="The tunnel didn't start">
          <p>{tunnel.error}</p>
          {retry}
        </Callout>
      );
    case "up":
      return (
        <p className="sh-share-tunnel">
          <Badge tone="good">Public</Badge> through Cloudflare at <code>{tunnel.url?.replace("https://", "")}</code>
        </p>
      );
    default:
      return null;
  }
}

function NewLink({
  wikiId,
  state,
  act,
  target,
}: {
  wikiId: string;
  state: SharesState;
  act: ReturnType<typeof useShares>["act"];
  target?: ShareTargetOf;
}) {
  const [kind, setKind] = useState<ShareKind>("comment");
  const [rights, setRights] = useState<"look" | "edit">("edit");
  const [duration, setDuration] = useState<ShareDuration>("24h");
  const [label, setLabel] = useState("");
  const [host, setHost] = useState(() => savedHost() || state.host);
  const [busy, setBusy] = useState(false);
  const id = useId();

  /** A changed name applies to every link at once. */
  const renameHost = () => {
    const name = host.trim();
    if (!name || name === state.host) return;
    saveHost(name);
    void act(() => api.setHost(name));
  };
  const create = async () => {
    setBusy(true);
    const name = host.trim();
    if (name) saveHost(name);
    await act(() =>
      api.share({
        wiki: wikiId,
        kind: target?.kind ?? kind,
        duration,
        label: label.trim(),
        host: name || undefined,
        ...(target ? { target: target.id } : {}),
        ...(target?.kind === "sheet" ? { edit: rights === "edit" } : {}),
      }),
    );
    setLabel("");
    setBusy(false);
  };

  return (
    <section className="sh-share-new" aria-label="New link">
      {!target && (
        <div className="sh-share-field">
          <span className="sh-share-label">People with the link</span>
          <Segmented label="What guests can do" value={kind} onChange={setKind} options={KINDS} />
        </div>
      )}
      {target?.kind === "sheet" && (
        <div className="sh-share-field">
          <span className="sh-share-label">People with the link</span>
          <Segmented label="What people can do" value={rights} onChange={setRights} options={SHEET_RIGHTS} />
        </div>
      )}
      <div className="sh-share-grid">
        <div className="sh-share-field">
          <span className="sh-share-label" aria-hidden="true">
            Lasts
          </span>
          <Select value={duration} onChange={setDuration} options={DURATIONS} label="How long the link lasts" />
        </div>
        <div className="sh-share-field">
          <label className="sh-share-label" htmlFor={`${id}-for`}>
            For (optional)
          </label>
          <Input
            id={`${id}-for`}
            value={label}
            maxLength={60}
            placeholder="Who it's for"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="sh-share-field">
          <label className="sh-share-label" htmlFor={`${id}-host`}>
            Your name for guests
          </label>
          <Input
            id={`${id}-host`}
            value={host}
            maxLength={32}
            onChange={(e) => setHost(e.target.value)}
            onBlur={renameHost}
            onKeyDown={(e) => {
              if (e.key === "Enter") renameHost();
            }}
          />
        </div>
      </div>
      <div className="sh-share-actions">
        <span className="sh-share-quiet">
          Guests see your {target?.kind === "sheet" ? "changes" : target?.kind === "board" ? "notes" : "comments"}{" "}
          signed {state.host}.
        </span>
        <Button variant="solid" icon="link" disabled={busy} onClick={() => void create()}>
          Create link
        </Button>
      </div>
    </section>
  );
}

function LinkCard({
  share,
  up,
  now,
  act,
}: {
  share: ShareInfo;
  up: boolean;
  now: number;
  act: ReturnType<typeof useShares>["act"];
}) {
  const recent = share.activity.slice(-8).reverse();
  const badge = kindLabel(share);
  const [one, many] = WRITES[share.kind];
  return (
    <article className="sh-share-link">
      <header className="sh-share-row">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {share.label && <strong className="sh-share-for">{share.label}</strong>}
        <span className="sh-share-quiet sh-share-ends">
          {share.expiresAt ? `ends in ${left(share.expiresAt, now)}` : "until Shiori closes"}
        </span>
        <Button size="sm" variant="ghost" icon="close" onClick={() => void act(() => api.revokeShare(share.id))}>
          Revoke
        </Button>
      </header>
      <div className="sh-share-row">
        <Input readOnly value={share.url} aria-label="Link" onFocus={(e) => e.currentTarget.select()} />
        <CopyButton text={share.url} label="Copy link" />
      </div>
      {!up && <p className="sh-share-quiet">This address works on this PC only until the tunnel is up.</p>}

      <h4 className="sh-share-subheading">
        Guests <span className="sh-share-quiet">{share.guests.length || "none yet"}</span>
        {share.blockedIps > 0 && (
          <Badge tone="bad">
            {share.blockedIps} address{share.blockedIps === 1 ? "" : "es"} blocked
          </Badge>
        )}
      </h4>
      {share.guests.length > 0 && (
        <ul className="sh-share-guests">
          {share.guests.map((g) => (
            <li key={g.id} data-blocked={g.blocked || undefined}>
              <span className="sh-share-guest">{g.name}</span>
              {g.blocked && <Badge tone="bad">Blocked</Badge>}
              <span className="sh-share-quiet">
                seen {ago(g.lastSeen)} · {g.writes} {g.writes === 1 ? one : many}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={g.blocked ? "undo" : "block"}
                onClick={() => void act(() => api.blockGuest(share.id, g.id, !g.blocked))}
              >
                {g.blocked ? "Let back in" : "Block"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {recent.length > 0 && (
        <details className="sh-share-activity">
          <summary>Recent activity</summary>
          <ul>
            {recent.map((a) => (
              <li key={`${a.at}-${a.who}-${a.what}`}>
                <time dateTime={a.at}>{ago(a.at)}</time> <strong>{a.who}</strong> {a.what}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Button size="sm" variant="soft" icon={copied ? "check" : "copy"} onClick={() => void copy()}>
      {copied ? "Copied" : label}
    </Button>
  );
}

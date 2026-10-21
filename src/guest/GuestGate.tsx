// The way in for a guest (ADR-0003): checks the share link, asks for a display name, then shows the wiki. When the
// link ends (it expired, the owner turned it off, or the guest was blocked) it says so instead.
import { type FormEvent, useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import type { GuestSession } from "../../shared/api.ts";
import { ApiError, api } from "../lib/api.ts";
import { pollChanges } from "../lib/live.ts";
import { Button, Icon, Input } from "../ui/index.ts";
import { GuestContext, useGuest } from "./GuestContext.ts";
import "./guest.css";

type State = { session: GuestSession } | { ended: number } | null;

export function GuestGate() {
  const [state, setState] = useState<State>(null);
  useEffect(() => {
    api.session().then(
      (session) => setState({ session }),
      (e) => setState({ ended: e instanceof ApiError ? e.status : 0 }),
    );
  }, []);

  const session = state && "session" in state ? state.session : null;
  const joined = !!session?.guest;
  const wikiId = session?.wiki.id;
  useEffect(() => {
    if (!joined || !wikiId) return;
    return pollChanges(wikiId, (status) => setState({ ended: status }));
  }, [joined, wikiId]);

  if (!state) return null;
  if ("ended" in state) return <LinkEnded status={state.ended} />;
  if (!state.session.guest) return <NamePrompt session={state.session} onJoined={(s) => setState({ session: s })} />;
  return (
    <GuestContext.Provider value={state.session}>
      <Outlet />
    </GuestContext.Provider>
  );
}

/** The link's root opens its wiki. */
export function GuestHome() {
  const guest = useGuest();
  return guest ? <Navigate to={`/w/${guest.wiki.id}`} replace /> : null;
}

function until(expiresAt: string | null): string {
  if (!expiresAt) return "until the person sharing it closes Shiori";
  return `until ${new Date(expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}

function NamePrompt({ session, onJoined }: { session: GuestSession; onJoined: (s: GuestSession) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const comment = session.kind === "comment";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onJoined(await api.join(name));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Someone here already uses that name. Try another."
          : err instanceof ApiError && err.status === 400
            ? "A name is 2 to 32 characters."
            : "Couldn't join. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="sh-guest">
      <form className="sh-guest-card" onSubmit={(e) => void submit(e)}>
        <p className="sh-guest-kicker">Shared with you</p>
        <h1 className="sh-guest-title">{session.wiki.title}</h1>
        <p className="sh-guest-text">
          {comment
            ? "You can read this wiki, comment on it and answer its questions."
            : "You can read this wiki and its comments."}{" "}
          The link works {until(session.expiresAt)}.
        </p>
        <label className="sh-guest-label" htmlFor="sh-guest-name">
          Your name
        </label>
        <Input
          id="sh-guest-name"
          autoFocus
          autoComplete="nickname"
          maxLength={32}
          value={name}
          placeholder="How others see you"
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p className="sh-guest-error" role="alert">
            {error}
          </p>
        )}
        <p className="sh-guest-hint">
          {comment ? "It's shown with your comments and answers." : "The person sharing the wiki sees who's reading."}
        </p>
        <Button variant="solid" type="submit" disabled={name.trim().length < 2 || busy}>
          Open the wiki
        </Button>
      </form>
    </main>
  );
}

const ENDED: Record<number, { title: string; text: string }> = {
  404: { title: "No such link", text: "Check that you copied the whole link." },
  410: { title: "This link has ended", text: "It expired, or the person who shared it turned it off." },
  403: {
    title: "You can't open this wiki any more",
    text: "The person who shared it took away your access, or too many requests came from here.",
  },
  401: { title: "Your name was forgotten", text: "Reload the page to pick it again." },
};

function LinkEnded({ status }: { status: number }) {
  const { title, text } = ENDED[status] ?? {
    title: "Couldn't reach the wiki",
    text: "Sharing may have stopped, or the computer sharing it is off or asleep. Try again later.",
  };
  return (
    <main className="sh-guest">
      <section className="sh-guest-card">
        <span className="sh-guest-icon">
          <Icon name="danger" size={20} />
        </span>
        <h1 className="sh-guest-title">{title}</h1>
        <p className="sh-guest-text">{text}</p>
        <Button variant="soft" icon="undo" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </section>
    </main>
  );
}

// Previews of the app's special screens under /dev/screens/<name>, for the toolbox's design system. Each renders the real component with
// sample data, so a preview can't drift from what people see. The error page and "not found" are real route errors
// (App.tsx), caught by the real error boundary.
import { type ReactNode, useState } from "react";
import { useParams } from "react-router";
import type { GuestSession } from "../../shared/api.ts";
import { LinkEnded, NamePrompt } from "../guest/GuestGate.tsx";
import { DeckOffline, NoWikis } from "../home/Deck.tsx";
import { ApiError } from "../lib/api.ts";
import { WikiUnavailable } from "../wiki/WikiLayout.tsx";
import "./ui-page.css";

const HOUR = 3_600_000;
const session = (kind: GuestSession["kind"], expiresAt: string | null): GuestSession => ({
  wiki: { id: "sample", title: "Fish Dive" },
  kind,
  expiresAt,
  guest: null,
  host: "Nari",
});

/** Joining in a preview: "Host" and "Mika" are taken, "x" is too short, anything else joins. */
async function fakeJoin(name: string): Promise<GuestSession> {
  await new Promise((done) => setTimeout(done, 300));
  const n = name.trim().toLowerCase();
  if (n.length < 2) throw new ApiError(400, "a name is 2 to 32 characters");
  if (n === "host" || n === "mika") throw new ApiError(409, "that name is taken");
  return { ...session("comment", null), guest: { name: name.trim() } };
}

function Join({ kind }: { kind: GuestSession["kind"] }) {
  const [joined, setJoined] = useState<string | null>(null);
  const [expiresAt] = useState(() => new Date(Date.now() + 23 * HOUR).toISOString());
  return (
    <>
      <NamePrompt session={session(kind, expiresAt)} join={fakeJoin} onJoined={(s) => setJoined(s.guest?.name ?? "")} />
      {joined !== null && <p className="ui-screen-joined">Joined as {joined}; the guest would see the wiki now.</p>}
    </>
  );
}

/** Thrown inside a route, so the real error page catches it. */
export function Crash(): ReactNode {
  throw new Error("A sample error: something went wrong while rendering this page.");
}

export const SCREENS: { name: string; title: string; what: string; render?: () => ReactNode }[] = [
  {
    name: "guest-join",
    title: "Guest: pick a name",
    what: "A comment link's first screen",
    render: () => <Join kind="comment" />,
  },
  {
    name: "guest-join-view",
    title: "Guest: pick a name (view link)",
    what: "A read-only link's first screen",
    render: () => <Join kind="view" />,
  },
  {
    name: "link-ended",
    title: "Link ended (410)",
    what: "Expired or turned off",
    render: () => <LinkEnded status={410} />,
  },
  {
    name: "blocked",
    title: "Blocked (403)",
    what: "The host blocked them, or too many requests",
    render: () => <LinkEnded status={403} />,
  },
  {
    name: "name-forgotten",
    title: "Name forgotten (401)",
    what: "The cookie is gone",
    render: () => <LinkEnded status={401} />,
  },
  {
    name: "no-link",
    title: "No such link (404)",
    what: "A link that never existed",
    render: () => <LinkEnded status={404} />,
  },
  {
    name: "unreachable",
    title: "Can't reach the wiki",
    what: "Sharing stopped, or the host is asleep",
    render: () => <LinkEnded status={0} />,
  },
  {
    name: "wiki-unavailable",
    title: "Wiki unavailable",
    what: "A wiki that's gone or broken",
    render: () => <WikiUnavailable reason="404 no such wiki" />,
  },
  { name: "no-wikis", title: "Empty deck", what: "No wikis yet", render: () => <NoWikis /> },
  { name: "deck-offline", title: "Server unreachable", what: "The deck can't load", render: () => <DeckOffline /> },
  { name: "error", title: "Error page", what: "A page that throws while rendering" },
  { name: "not-found", title: "Not found", what: "A route that doesn't exist" },
];

/** /dev/screens/:name */
export function Screen() {
  const { name } = useParams();
  const screen = SCREENS.find((s) => s.name === name && s.render);
  // The route's loader already answered 404 for any other name.
  if (!screen?.render) return null;
  return (
    <>
      {screen.render()}
      <span className="ui-screen-tag">Preview · {screen.title}</span>
    </>
  );
}

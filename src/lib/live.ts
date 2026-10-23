// One shared EventSource for file and comment changes pushed by the server. Guests (ADR-0003) reach the app through a
// tunnel that can't carry server-sent events, so for them the same events come from long polling the wiki's version.
import { useEffect, useRef } from "react";
import type { LiveEvent } from "../../shared/api.ts";
import { isGuest, withBase } from "./base.ts";

type Listener = (e: LiveEvent) => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;

const emit = (event: LiveEvent) => {
  for (const l of listeners) l(event);
};

function connect() {
  if (source || isGuest) return;
  source = new EventSource("/api/events");
  source.onmessage = (m) => {
    if (!m.data) return;
    emit(JSON.parse(m.data) as LiveEvent);
  };
}

/** Calls `onEvent` for every live event while mounted. */
export function useLive(onEvent: Listener) {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    connect();
    const l: Listener = (e) => ref.current(e);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}

/** What a guest's request for changes answers: the wiki's versions, and who is here (ADR-0005). */
interface Version {
  pages: number;
  threads: number;
  designs: number;
  presence: string;
}

/** Seconds the server may hold a guest's request for changes; it answers sooner when something changes. */
const WAIT = 25;
/** The link is gone, the guest was blocked, or their name was lost. Anything else (a 304, a busy tunnel) retries. */
const ENDED = [401, 403, 404, 410];
/**
 * Requests in a row that can't reach the server before giving up. When the last link ends, the guest server and the
 * tunnel stop, so nothing answers at all.
 */
const UNREACHABLE = 3;
/** The pause before asking again after a failed request. */
const RETRY = 4000;

/**
 * Guests: live updates by long polling. Each request waits on the server until the wiki's pages, comments or people
 * change (or 25 seconds pass), then the answer becomes live events and the next request goes out at once. `onEnded`
 * hears the status when the link stops working, and asking stops.
 */
export function pollChanges(wiki: string, onEnded: (status: number) => void): () => void {
  let last: Version | null = null;
  return poll(
    `/api/wikis/${encodeURIComponent(wiki)}/changes`,
    (v: Version) => {
      if (last && v.pages !== last.pages) emit({ type: "pages", wiki });
      if (last && v.threads !== last.threads) emit({ type: "threads", wiki });
      if (last && v.designs !== last.designs) emit({ type: "designs", wiki });
      if (last && v.presence !== last.presence) emit({ type: "presence", wiki });
      last = v;
    },
    onEnded,
  );
}

/**
 * Long polling any `changes` route (a wiki's, a board link's, a sheet link's, ADR-0010): `onAnswer` hears each new
 * version, the first one too; `onEnded` hears the status when the link stops working.
 */
export function poll<V>(path: string, onAnswer: (v: V) => void, onEnded: (status: number) => void): () => void {
  let etag = "";
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const url = withBase(`${path}?wait=${WAIT}`);

  const ask = async () => {
    // A short gap even after an answer, so a server that answers at once can't make a tight loop.
    let pause = 250;
    try {
      const res = await fetch(url, { headers: etag ? { "if-none-match": etag } : {}, signal: controller.signal });
      failures = res.status >= 500 ? failures + 1 : 0;
      // Over the limit: wait as long as the server asks, so the guest isn't blocked for hammering it.
      if (res.status === 429) pause = Math.max(RETRY, Number(res.headers.get("retry-after")) * 1000 || 0);
      if (res.status === 200) {
        etag = res.headers.get("etag") ?? "";
        onAnswer((await res.json()) as V);
      } else if (ENDED.includes(res.status)) {
        if (!stopped) onEnded(res.status);
        return;
      }
    } catch {
      if (stopped) return;
      failures++;
    }
    if (stopped) return;
    if (failures >= UNREACHABLE) return onEnded(0);
    timer = setTimeout(() => void ask(), failures ? RETRY : pause);
  };
  void ask();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller.abort();
  };
}

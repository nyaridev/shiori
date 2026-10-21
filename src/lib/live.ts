// One shared EventSource for file and comment changes pushed by the server. Guests (ADR-0003) reach the app through a
// tunnel that can't carry server-sent events, so for them the same events come from polling the wiki's version.
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

const POLL = 10_000;
/** The link is gone, the guest was blocked, or their name was lost. Anything else (a 304, a busy tunnel) retries. */
const ENDED = [401, 403, 404, 410];
/**
 * Polls in a row that can't reach the server before giving up. When the last link ends, the guest server and the
 * tunnel stop, so nothing answers at all.
 */
const UNREACHABLE = 3;

/**
 * Guests: asks every 10 seconds whether the wiki's pages or comments changed, and turns the answer into live events.
 * An unchanged wiki costs one small 304. `onEnded` hears the status when the link stops working; polling stops.
 */
export function pollChanges(wiki: string, onEnded: (status: number) => void): () => void {
  let etag = "";
  let last: { pages: number; threads: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let failures = 0;
  const tick = async () => {
    if (!document.hidden) {
      try {
        const res = await fetch(withBase(`/api/wikis/${encodeURIComponent(wiki)}/changes`), {
          headers: etag ? { "if-none-match": etag } : {},
        });
        failures = res.status >= 500 ? failures + 1 : 0;
        if (res.status === 200) {
          etag = res.headers.get("etag") ?? "";
          const v = (await res.json()) as { pages: number; threads: number };
          if (last && v.pages !== last.pages) emit({ type: "pages", wiki });
          if (last && v.threads !== last.threads) emit({ type: "threads", wiki });
          last = v;
        } else if (ENDED.includes(res.status)) {
          if (!stopped) onEnded(res.status);
          return;
        }
      } catch {
        failures++;
      }
      if (failures >= UNREACHABLE) {
        if (!stopped) onEnded(0);
        return;
      }
    }
    if (!stopped) timer = setTimeout(tick, POLL);
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

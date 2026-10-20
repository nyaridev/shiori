// One shared EventSource for file and comment changes pushed by the server.
import { useEffect, useRef } from "react";
import type { LiveEvent } from "../../shared/api.ts";

type Listener = (e: LiveEvent) => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;

function connect() {
  if (source) return;
  source = new EventSource("/api/events");
  source.onmessage = (m) => {
    if (!m.data) return;
    const event = JSON.parse(m.data) as LiveEvent;
    for (const l of listeners) l(event);
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

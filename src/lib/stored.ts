// Small per-viewer settings kept in this browser's localStorage (recently viewed pages, collapsed sidebar sections).
// Every tab of the browser follows the same value. A browser that refuses storage just forgets.
import { useCallback, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, unknown>();

function read<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let value = fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) value = JSON.parse(raw) as T;
  } catch {}
  cache.set(key, value);
  return value;
}

function notify(key: string) {
  for (const l of listeners.get(key) ?? []) l();
}

export function writeStored<T>(key: string, value: T) {
  cache.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  notify(key);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key || !listeners.has(e.key)) return;
    cache.delete(e.key);
    notify(e.key);
  });
}

/** A stored value and its setter. `fallback` must be stable (a constant), since it's the value before any write. */
export function useStored<T>(key: string, fallback: T): [T, (value: T) => void] {
  const subscribe = useCallback(
    (l: () => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(l);
      listeners.set(key, set);
      return () => set.delete(l);
    },
    [key],
  );
  const value = useSyncExternalStore(subscribe, () => read(key, fallback));
  const set = useCallback((v: T) => writeStored(key, v), [key]);
  return [value, set];
}

/** The stored value outside React. */
export const readStored = <T>(key: string, fallback: T): T => read(key, fallback);

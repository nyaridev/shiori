import { useCallback, useEffect, useRef, useState } from "react";
import { peek } from "./cache.ts";

export interface Resource<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  /** Fetch again, keeping the current data on screen until the new data arrives. */
  reload: () => void;
}

/**
 * Loads `load()` whenever `key` changes. A null key loads nothing. Data primed in the cache shows at once. With
 * `keep`, the last key's data stays on screen while a new key loads (pages of a list), and `loading` says so.
 */
export function useResource<T>(key: string | null, load: () => Promise<T>, opts?: { keep?: boolean }): Resource<T> {
  const [state, setState] = useState<{ key: string | null; data?: T; error: Error | null }>(() => {
    const primed = key === null ? undefined : peek<T>(key);
    return primed === undefined ? { key: null, error: null } : { key, data: primed, error: null };
  });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` re-runs the load on purpose.
  useEffect(() => {
    if (key === null) return;
    let live = true;
    loadRef.current().then(
      (data) => live && setState({ key, data, error: null }),
      (error: Error) => live && setState((s) => ({ ...s, key, error })),
    );
    return () => {
      live = false;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = state.key === key;
  const data = current || opts?.keep ? state.data : undefined;
  return { data, error: current ? state.error : null, loading: !current, reload };
}

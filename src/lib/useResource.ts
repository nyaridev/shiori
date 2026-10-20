import { useCallback, useEffect, useRef, useState } from "react";

export interface Resource<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  /** Fetch again, keeping the current data on screen until the new data arrives. */
  reload: () => void;
}

/** Loads `load()` whenever `key` changes. A null key loads nothing. */
export function useResource<T>(key: string | null, load: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<{ key: string | null; data?: T; error: Error | null }>({ key: null, error: null });
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
  return { data: current ? state.data : undefined, error: current ? state.error : null, loading: !current, reload };
}

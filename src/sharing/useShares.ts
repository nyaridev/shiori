import { useCallback, useEffect, useState } from "react";
import type { SharesState } from "../../shared/api.ts";
import { ApiError, api } from "../lib/api.ts";

const message = (e: unknown) => (e instanceof ApiError ? e.detail : (e as Error).message);

/**
 * The owner's share links and tunnel, refreshed while the Share dialog is open: every second while the tunnel
 * starts, so its public address shows as soon as it answers.
 */
export function useShares() {
  const [state, setState] = useState<SharesState | null>(null);
  /** Why sharing isn't available at all (dev mode answers 409). */
  const [unavailable, setUnavailable] = useState<string | null>(null);
  /** Why the last action didn't work. */
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.shares());
      setUnavailable(null);
    } catch (e) {
      setUnavailable(message(e));
    }
  }, []);

  const starting = state?.tunnel.state === "starting";
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), starting ? 1000 : 4000);
    return () => clearInterval(timer);
  }, [refresh, starting]);

  /** Runs an owner action, then shows the new state (the action's own, when it returns one). */
  const act = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      try {
        const result = await action();
        setProblem(null);
        if (result && typeof result === "object" && "tunnel" in result) setState(result as SharesState);
        else await refresh();
        return true;
      } catch (e) {
        setProblem(message(e));
        return false;
      }
    },
    [refresh],
  );

  return { state, unavailable, problem, act };
}

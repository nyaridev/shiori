import { useCallback, useEffect, useState } from "react";
import type { SharesState } from "../../shared/api.ts";
import { ApiError, api } from "../lib/api.ts";
import { useLive } from "../lib/live.ts";

const message = (e: unknown) => (e instanceof ApiError ? e.detail : (e as Error).message);

/**
 * The owner's share links and tunnel while the Share dialog is open, kept live: the server sends a `shares` event
 * whenever links, guests, activity or the tunnel change. A slow timer covers a dropped connection.
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

  useLive((e) => {
    if (e.type === "shares") void refresh();
  });
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

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

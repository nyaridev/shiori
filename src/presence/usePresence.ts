// Presence (ADR-0005): this tab tells the server which page of the wiki it's on, and learns who else is here. It
// reports a moment after each move and every 15 seconds while open, and says goodbye when it leaves the wiki or the
// page closes. The owner hears about changes over server-sent events, a guest through their long poll.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Person } from "../../shared/api.ts";
import { api } from "../lib/api.ts";
import { useLive } from "../lib/live.ts";

/** This tab, for the owner's server; a guest's server knows them by their cookie. */
const TAB = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
/** The server forgets a tab after 40 seconds without a report. */
const HEARTBEAT = 15_000;
/** A short wait after a move, so clicking through pages reports only where the tab stops. */
const SETTLE = 600;

/** Who is on `wikiId` now, while this tab says it's on `page`. */
export function usePresence(wikiId: string, page: string): Person[] {
  const [people, setPeople] = useState<Person[]>([]);
  const at = useRef(page);
  at.current = page;

  const report = useCallback(() => {
    api.here(wikiId, TAB, at.current).then(setPeople, () => undefined);
  }, [wikiId]);

  // A move: report once the tab settles.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `page` is read through `at`; a new one reports again.
  useEffect(() => {
    const timer = setTimeout(report, SETTLE);
    return () => clearTimeout(timer);
  }, [report, page]);

  // Staying: a heartbeat, and goodbye when the wiki or the page closes (and hello again if it comes back).
  useEffect(() => {
    const timer = setInterval(report, HEARTBEAT);
    const bye = () => void api.leave(wikiId, TAB);
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) report();
    };
    window.addEventListener("pagehide", bye);
    window.addEventListener("pageshow", back);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", bye);
      window.removeEventListener("pageshow", back);
      bye();
      setPeople([]);
    };
  }, [wikiId, report]);

  useLive((e) => {
    if (e.type === "presence" && e.wiki === wikiId) api.people(wikiId).then(setPeople, () => undefined);
  });

  return people;
}

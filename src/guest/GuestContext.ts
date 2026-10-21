// What a guest who came through a share link (ADR-0003) may do. In the owner's app there's no session, and the owner
// may do everything.
import { createContext, useContext } from "react";
import type { Authored, GuestSession, Thread } from "../../shared/api.ts";

export const GuestContext = createContext<GuestSession | null>(null);

/** The share link's session when the app runs for a guest; null in the owner's app. */
export const useGuest = () => useContext(GuestContext);

/** Commenting, replying and answering: the owner always, a guest on a comment link. */
export function canComment(guest: GuestSession | null): boolean {
  return !guest || guest.kind === "comment";
}

/** Resolving and reopening: the owner any thread, a guest only the threads they started. */
export function canResolve(guest: GuestSession | null, thread: Thread): boolean {
  return !guest || (guest.kind === "comment" && !!thread.messages[0]?.mine);
}

/** How a message or an answer is signed: "You" for your own, then "Agent", the guest's name, or the host's. */
export function authorName(guest: GuestSession | null, a: Authored): string {
  if (guest ? a.mine : a.author === "user") return "You";
  if (a.author === "agent") return "Agent";
  return a.name ?? (a.author === "user" ? (guest?.host ?? "Host") : "Guest");
}

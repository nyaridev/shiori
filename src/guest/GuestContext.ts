// What a guest who came through a share link (ADR-0003) may do. In the owner's app there's no session, and the owner
// may do everything.
import { createContext, useContext } from "react";
import type { Authored, GuestSession, Message, Thread } from "../../shared/api.ts";

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

/** Editing a message (ADR-0010): only its author, the owner their own and a guest their own on an open thread. */
export function canEdit(guest: GuestSession | null, thread: Thread, m: Message): boolean {
  if (!guest) return m.author === "user";
  return guest.kind === "comment" && !!m.mine && thread.status === "open";
}

/** Removing a thread: the owner any, a guest only the ones they started. */
export function canRemove(guest: GuestSession | null, thread: Thread): boolean {
  return !guest || (guest.kind === "comment" && !!thread.messages[0]?.mine);
}

/** Hiding a guest's message from guests and the inbox: the owner only (ADR-0003). */
export function canHide(guest: GuestSession | null, m: Message): boolean {
  return !guest && m.author === "guest";
}

/** How a message or an answer is signed: "You" for your own, then "Agent", the guest's name, or the host's. */
export function authorName(guest: GuestSession | null, a: Authored): string {
  if (guest ? a.mine : a.author === "user") return "You";
  if (a.author === "agent") return "Agent";
  return a.name ?? (a.author === "user" ? (guest?.host ?? "Host") : "Guest");
}

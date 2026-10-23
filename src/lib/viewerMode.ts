// Day or night: the viewer's choice, remembered in this browser for every wiki, or else the system's preference
// (followed live when it changes). Tabs of the same browser follow each other.
import { useSyncExternalStore } from "react";
import type { Mode } from "../../shared/theme.ts";

const KEY = "shiori.mode";
const listeners = new Set<() => void>();

function read(): Mode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

const dark = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined;
/** The system's day or night. */
export const systemMode = (): Mode => (dark?.matches ? "dark" : "light");

let picked = read();
let system = systemMode();

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    picked = read();
    l();
  };
  const onSystem = () => {
    system = systemMode();
    l();
  };
  window.addEventListener("storage", onStorage);
  dark?.addEventListener("change", onSystem);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
    dark?.removeEventListener("change", onSystem);
  };
}

/** Day or night as the viewer picked it, or null when it follows the system. */
export const usePickedMode = () => useSyncExternalStore(subscribe, () => picked);
/** The system's day or night, kept live. */
export const useSystemMode = () => useSyncExternalStore(subscribe, () => system);
/** The mode wikis show in: the viewer's pick, else the system's. */
export const useViewerMode = (): Mode => {
  const p = usePickedMode();
  const s = useSystemMode();
  return p ?? s;
};

/** Remember a pick; null (or the system's own mode) forgets it, so the system decides again. */
export function setViewerMode(mode: Mode | null) {
  picked = mode === systemMode() ? null : mode;
  try {
    if (picked) localStorage.setItem(KEY, picked);
    else localStorage.removeItem(KEY);
  } catch {}
  for (const l of listeners) l();
}

/** The current mode, outside React (the card opening paints the wiki's background before it mounts). */
export const viewerMode = (): Mode => picked ?? systemMode();

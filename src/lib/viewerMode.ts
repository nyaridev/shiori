// The viewer's day/night choice, remembered in this browser for every wiki. Without one, each wiki shows in its own
// theme's mode. Tabs of the same browser follow each other.
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

let current = read();

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    current = read();
    l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Day or night as the viewer picked it, or null to follow each wiki's theme. */
export const useViewerMode = () => useSyncExternalStore(subscribe, () => current);

export function setViewerMode(mode: Mode | null) {
  current = mode;
  try {
    if (mode) localStorage.setItem(KEY, mode);
    else localStorage.removeItem(KEY);
  } catch {}
  for (const l of listeners) l();
}

/** The current choice, outside React (the card opening paints the wiki's background before it mounts). */
export const viewerMode = () => current;

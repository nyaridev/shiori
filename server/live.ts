// Watches the wiki folders and tells open tabs what changed, so an agent's edits show up without a reload.
// Changes in a wiki's `data/` (the comment database, also written by the CLI) refresh threads, not pages.
import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import type { LiveEvent } from "../shared/api.ts";
import { LINKS_FILE, type Registry } from "./registry.ts";

type Listener = (event: LiveEvent) => void;

export function createLive(registry: Registry) {
  const listeners = new Set<Listener>();
  const watchers: FSWatcher[] = [];
  const pending = new Map<string, LiveEvent>();
  let timer: NodeJS.Timeout | null = null;

  const emit = (event: LiveEvent) => {
    pending.set(JSON.stringify(event), event);
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const events = [...pending.values()];
      pending.clear();
      if (events.some((e) => e.type !== "threads" && e.type !== "designs" && e.type !== "git")) registry.invalidate();
      for (const e of events) for (const l of listeners) l(e);
    }, 120);
  };

  const changed = (file: string) => {
    const { wiki, area } = registry.classify(file);
    if (area === "ignore") return;
    if (area === "data") {
      if (wiki) emit({ type: "threads", wiki });
      return;
    }
    // What people make in the app (ADR-0006): its own event, so pages aren't rendered again for each stroke.
    if (area === "designs") {
      if (wiki) emit({ type: "designs", wiki });
      return;
    }
    // A commit or a pull (ADR-0008): page histories, not the pages.
    if (area === "git") {
      if (wiki) emit({ type: "git", wiki });
      return;
    }
    if (area === "meta" || !wiki) emit({ type: "wikis" });
    if (wiki) emit({ type: "pages", wiki });
  };

  const watchTree = (dir: string) => {
    try {
      const w = watch(dir, { recursive: true }, (_e, file) => changed(file ? join(dir, String(file)) : dir));
      w.on("error", () => {});
      watchers.push(w);
    } catch {
      // A linked folder that doesn't exist yet; it's reported as broken.
    }
  };

  const start = () => {
    for (const w of watchers.splice(0)) w.close();
    for (const dir of registry.watchDirs()) watchTree(dir);
    if (registry.dev) return;
    const rootWatch = watch(registry.appRoot, (_e, file) => {
      if (String(file) !== LINKS_FILE) return;
      registry.invalidate();
      start();
      emit({ type: "wikis" });
    });
    watchers.push(rootWatch);
  };

  return {
    start,
    stop: () => {
      for (const w of watchers.splice(0)) w.close();
    },
    subscribe: (l: Listener) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
export type Live = ReturnType<typeof createLive>;

// Watches every wiki folder and tells open tabs what changed, so an agent's edits show up without a reload.
// Changes in a wiki's `data/` (the comment database, also written by the CLI) refresh threads, not pages.
import { type FSWatcher, watch } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { LiveEvent } from "../shared/api.ts";
import { LINKS_FILE, type Registry, readLinks } from "./registry.ts";

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
      if (events.some((e) => e.type !== "threads")) registry.invalidate();
      for (const e of events) for (const l of listeners) l(e);
    }, 120);
  };

  /** A changed file somewhere under `base` → an event for the wiki that owns it. */
  const changed = (base: string, file: string | null) => {
    const full = file ? join(base, file) : base;
    const wiki = registry.all().find((w) => !relative(w.root, full).startsWith(".."));
    if (!wiki) return emit({ type: "wikis" });
    const rel = relative(wiki.root, full).split(sep);
    if (rel[0] === "data") return emit({ type: "threads", wiki: wiki.id });
    if (rel[0] === "wiki.json" || rel[0] === "theme.json" || rel[0] === wiki.manifest.cover) emit({ type: "wikis" });
    emit({ type: "pages", wiki: wiki.id });
  };

  const watchTree = (dir: string) => {
    try {
      const w = watch(dir, { recursive: true }, (_e, file) => changed(dir, file ? String(file) : null));
      w.on("error", () => {});
      watchers.push(w);
    } catch {
      // A linked folder that doesn't exist yet; it's reported as broken.
    }
  };

  const start = () => {
    for (const w of watchers.splice(0)) w.close();
    watchTree(join(registry.appRoot, "wikis"));
    for (const p of readLinks(registry.appRoot)) watchTree(resolve(registry.appRoot, p));
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

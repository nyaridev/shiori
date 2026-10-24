// A page's forms (ADR-0015) and writing in them. Fields save as you go: text a moment after you stop typing (or when
// you leave the field), everything else at once. What you changed stays on screen while the server catches up; the
// rest follows the server, so the CLI or another tab show up live.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldValue, PageForm } from "../../../shared/form.ts";
import { api } from "../../lib/api.ts";
import { isGuest } from "../../lib/base.ts";
import { useLive } from "../../lib/live.ts";
import { useResource } from "../../lib/useResource.ts";

const NONE: PageForm[] = [];

/** The forms on a page. Guests never have any: the guest server has no route to them. */
export function usePageForms(wikiId: string, path: string, enabled: boolean) {
  const res = useResource(isGuest || !enabled ? null : `forms:${wikiId}:${path}`, () => api.forms(wikiId, path));
  const { reload } = res;
  useLive((e) => {
    // A form's file is a page change; a value is a database change.
    if ((e.type === "pages" || e.type === "threads") && e.wiki === wikiId) reload();
  });
  return { forms: res.data ?? NONE, loading: res.loading && !isGuest && enabled, error: res.error };
}

export interface SaveState {
  /** Changes not saved yet. */
  saving: boolean;
  error: string | null;
  /** When the last change was saved. */
  savedAt: string | null;
}

/** Editing one page's form. Key the component by page and form, so nothing carries over to another. */
export function useFormEditor(wikiId: string, path: string, form: PageForm) {
  const [local, setLocal] = useState<Map<string, FieldValue>>(() => new Map());
  const [state, setState] = useState<SaveState>({ saving: false, error: null, savedAt: null });
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const waiting = useRef(new Map<string, FieldValue>());
  const sending = useRef(0);

  const send = useCallback(
    async (field: string, value: FieldValue, keepalive = false) => {
      clearTimeout(timers.current.get(field));
      timers.current.delete(field);
      waiting.current.delete(field);
      sending.current++;
      setState((s) => ({ ...s, saving: true }));
      try {
        const saved = await api.setFormValue(wikiId, form.name, path, field, value, keepalive);
        setState((s) => ({ ...s, error: null, savedAt: saved?.updatedAt ?? s.savedAt }));
      } catch (e) {
        setState((s) => ({ ...s, error: (e as { detail?: string }).detail ?? String(e) }));
      } finally {
        sending.current--;
        if (!sending.current && !waiting.current.size) setState((s) => ({ ...s, saving: false }));
      }
    },
    [wikiId, path, form.name],
  );

  /** A field changed; it saves after `delay` ms (0: now). */
  const change = useCallback(
    (field: string, value: FieldValue, delay = 0) => {
      setLocal((m) => new Map(m).set(field, value));
      waiting.current.set(field, value);
      clearTimeout(timers.current.get(field));
      setState((s) => ({ ...s, saving: true }));
      if (delay <= 0) void send(field, value);
      else
        timers.current.set(
          field,
          setTimeout(() => void send(field, value), delay),
        );
    },
    [send],
  );

  /** Saves a field now if it's waiting (leaving it). */
  const commit = useCallback(
    (field: string) => {
      if (waiting.current.has(field)) void send(field, waiting.current.get(field) ?? null);
    },
    [send],
  );

  // Leaving the form or closing the page: what's waiting goes out at once.
  const flush = useRef(() => {});
  flush.current = () => {
    for (const [field, value] of waiting.current) void send(field, value, true);
  };
  useEffect(() => {
    const out = () => flush.current();
    window.addEventListener("pagehide", out);
    return () => {
      window.removeEventListener("pagehide", out);
      out();
    };
  }, []);

  const value = useCallback(
    (field: string): FieldValue =>
      local.has(field) ? (local.get(field) ?? null) : (form.values.find((v) => v.field === field)?.value ?? null),
    [local, form.values],
  );
  return { value, change, commit, state };
}

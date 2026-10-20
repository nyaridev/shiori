// A short-lived hand-off for data fetched ahead of time (the deck loads a wiki while its card opens), so the next
// screen can render complete on its first frame. Entries expire after a few seconds; `useResource` still refreshes.
const entries = new Map<string, { data: unknown; at: number }>();
const TTL = 10_000;

export function prime(key: string, data: unknown) {
  entries.set(key, { data, at: Date.now() });
}

export function peek<T>(key: string): T | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > TTL) {
    entries.delete(key);
    return undefined;
  }
  return entry.data as T;
}

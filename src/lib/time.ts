/** Time left until a moment: "40 s", "12 min", "3 h 5 min", "6 days 4 h". */
export function left(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ${h % 24} h`;
}

/** A past moment, as people say it: "just now", "5 min ago", "3 h ago", "4 days ago", then the date. */
export function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

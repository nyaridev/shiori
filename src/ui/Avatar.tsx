// A person as a round badge with their initials, colored from the tokens by a stable hash of their id. `ring` marks
// you; `role` adds a small mark for the host.

/** How many colors avatars cycle through (ui.css, `.sh-avatar[data-hue]`). */
const HUES = 6;

const hueOf = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h % HUES;
};

/** One or two letters: the first of the first two words. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? "")
    .join("") || "?";

export function Avatar({
  id,
  name,
  size = 28,
  ring = false,
  host = false,
}: {
  id: string;
  name: string;
  size?: number;
  ring?: boolean;
  host?: boolean;
}) {
  return (
    <span
      className="sh-avatar"
      data-hue={hueOf(id)}
      data-ring={ring || undefined}
      data-host={host || undefined}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

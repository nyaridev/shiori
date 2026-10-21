// Shiori's drawn icon set (`set/*.svg`), bundled with the app. Pages name one in their `icon`, the server checks the
// name (server/icons.ts), and PageIcon shows it. Add an icon only when none of these fits.
const files = import.meta.glob<string>("./set/*.svg", { eager: true, query: "?url", import: "default" });

/** Icon name → its URL in the built app. */
export const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([file, url]) => [file.slice("./set/".length, -".svg".length), url]),
);

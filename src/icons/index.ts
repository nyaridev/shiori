// Shiori's drawn icon set (`set/*.svg`), bundled with the app. Pages name one in their `icon`, the server checks the
// name (server/icons.ts), and PageIcon draws it inline, so its shapes take the wiki's colors from the tokens
// (`.sh-glyph` in styles/base.css). Add an icon only when none of these fits.
const files = import.meta.glob<string>("./set/*.svg", { eager: true, query: "?raw", import: "default" });

/** Icon name → the shapes inside its `<svg>`, without the title (the page's name says what it is). */
export const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([file, svg]) => [
    file.slice("./set/".length, -".svg".length),
    svg
      .replace(/^[\s\S]*?<svg[^>]*>/, "")
      .replace(/<\/svg>\s*$/, "")
      .replace(/<title>[\s\S]*?<\/title>/, "")
      .trim(),
  ]),
);

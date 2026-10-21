// Shiori's shared icon set: drawn SVGs in `src/icons/set/`, bundled with the app (src/icons/index.ts), so guests get
// them with its code. Pages pick one by name (`icon: compass`) and the server checks the name; the app uses them for
// its own lists, and a wiki draws its own only when none fits.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT } from "./paths.ts";

export const ICONS_DIR = join(APP_ROOT, "src", "icons", "set");

/** A name in the set: lowercase words joined by dashes. Emoji never look like this. */
export const ICON_NAME = /^[a-z][a-z0-9-]{0,39}$/;

let names: Set<string> | null = null;

/** Every icon in the set, read once. */
export function iconSet(): Set<string> {
  names ??= new Set(
    existsSync(ICONS_DIR)
      ? readdirSync(ICONS_DIR)
          .filter((f) => f.endsWith(".svg"))
          .map((f) => f.slice(0, -4))
      : [],
  );
  return names;
}

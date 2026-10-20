import type { Root } from "hast";
import { type Components, toJsxRuntime } from "hast-util-to-jsx-runtime";
import { useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import * as el from "./elements.tsx";
import "./prose.css";

const components = {
  a: el.WikiLink,
  input: el.TaskBox,
  "ld-callout": el.CalloutEl,
  "ld-infobox": el.InfoboxEl,
  "ld-row": el.RowEl,
  "ld-key": el.KeyEl,
  "ld-value": el.ValueEl,
  "ld-tabs": el.TabsEl,
  "ld-tab": el.TabEl,
  "ld-columns": el.ColumnsEl,
  "ld-column": el.ColumnEl,
  "ld-details": el.DetailsEl,
  "ld-badge": el.BadgeEl,
  "ld-kbd": el.KbdEl,
  "ld-unknown": el.UnknownEl,
} as unknown as Components;

/** Renders server-made hast with the app's components. */
export function Markdown({ hast }: { hast: Root }) {
  return useMemo(() => toJsxRuntime(hast, { Fragment, jsx, jsxs, components, ignoreInvalidStyle: true }), [hast]);
}

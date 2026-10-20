import type { Root } from "hast";
import { type Components, toJsxRuntime } from "hast-util-to-jsx-runtime";
import { useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import * as el from "./elements.tsx";
import "./prose.css";

const components = {
  a: el.WikiLink,
  input: el.TaskBox,
  "sh-callout": el.CalloutEl,
  "sh-infobox": el.InfoboxEl,
  "sh-row": el.RowEl,
  "sh-key": el.KeyEl,
  "sh-value": el.ValueEl,
  "sh-tabs": el.TabsEl,
  "sh-tab": el.TabEl,
  "sh-columns": el.ColumnsEl,
  "sh-column": el.ColumnEl,
  "sh-details": el.DetailsEl,
  "sh-badge": el.BadgeEl,
  "sh-kbd": el.KbdEl,
  "sh-unknown": el.UnknownEl,
} as unknown as Components;

/** Renders server-made hast with the app's components. */
export function Markdown({ hast }: { hast: Root }) {
  return useMemo(() => toJsxRuntime(hast, { Fragment, jsx, jsxs, components, ignoreInvalidStyle: true }), [hast]);
}

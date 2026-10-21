import type { Root } from "hast";
import { type Components, toJsxRuntime } from "hast-util-to-jsx-runtime";
import { useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import * as el from "./elements.tsx";
import * as uv from "./universal.tsx";
import "./planning.css";
import "./prose.css";

const components = {
  a: el.WikiLink,
  img: el.ImgEl,
  h2: el.H2El,
  h3: el.H3El,
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
  "sh-stats": el.StatsEl,
  "sh-stat": el.StatEl,
  "sh-timeline": el.TimelineEl,
  "sh-milestone": el.MilestoneEl,
  "sh-cards": el.CardsEl,
  "sh-card": el.CardEl,
  "sh-card-title": el.CardTitleEl,
  "sh-gallery": el.GalleryEl,
  "sh-shot": el.ShotEl,
  "sh-progress": el.ProgressEl,
  "sh-related": uv.RelatedEl,
  "sh-question": uv.QuestionEl,
  "sh-children": uv.ChildrenEl,
  "sh-toc": uv.TocEl,
  "sh-status": uv.StatusEl,
  "sh-steps": uv.StepsEl,
  "sh-step": uv.StepEl,
  "sh-compare": uv.CompareEl,
  "sh-option": uv.OptionEl,
  "sh-point": uv.PointEl,
  "sh-quote": uv.QuoteEl,
  "sh-embed": uv.EmbedEl,
  "sh-unknown": el.UnknownEl,
} as unknown as Components;

/** Renders server-made hast with the app's components. */
export function Markdown({ hast }: { hast: Root }) {
  return useMemo(() => toJsxRuntime(hast, { Fragment, jsx, jsxs, components, ignoreInvalidStyle: true }), [hast]);
}

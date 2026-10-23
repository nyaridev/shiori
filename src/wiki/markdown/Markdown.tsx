import type { Root } from "hast";
import { type Components, toJsxRuntime } from "hast-util-to-jsx-runtime";
import { useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import * as home from "../home/blocks.tsx";
import { RoadmapEl, RoadmapMilestoneEl } from "../roadmap/Roadmap.tsx";
import { CodeBlock } from "./code.tsx";
import { DataTableEl } from "./DataTable.tsx";
import { DiagramEl } from "./Diagram.tsx";
import * as el from "./elements.tsx";
import { SectionEl } from "./Section.tsx";
import * as uv from "./universal.tsx";
import "katex/dist/katex.min.css";
import "./planning.css";
import "./prose.css";

const components = {
  a: el.WikiLink,
  img: el.ImgEl,
  pre: CodeBlock,
  h2: el.H2El,
  table: el.TableEl,
  div: el.DivEl,
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
  "sh-roadmap": RoadmapEl,
  "sh-roadmap-milestone": RoadmapMilestoneEl,
  "sh-cards": el.CardsEl,
  "sh-card": el.CardEl,
  "sh-card-title": el.CardTitleEl,
  "sh-icon": el.IconEl,
  "sh-gallery": el.GalleryEl,
  "sh-shot": el.ShotEl,
  "sh-progress": el.ProgressEl,
  "sh-related": uv.RelatedEl,
  "sh-question": uv.QuestionEl,
  "sh-suggestion": uv.QuestionEl,
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
  "sh-boxes": home.BoxesEl,
  "sh-box": home.BoxEl,
  "sh-recent-changes": home.RecentChangesEl,
  "sh-open-questions": home.OpenQuestionsEl,
  "sh-open-tasks": home.OpenTasksEl,
  "sh-discussions": home.DiscussionsEl,
  "sh-directory": home.DirectoryEl,
  "sh-designs": home.DesignsEl,
  "sh-sheet": el.SheetEl,
  "sh-private": el.PrivateEl,
  "sh-spoiler": el.SpoilerEl,
  "sh-section": SectionEl,
  "sh-diagram": DiagramEl,
  "sh-table": DataTableEl,
  "sh-unknown": el.UnknownEl,
} as unknown as Components;

/** Renders server-made hast with the app's components. */
export function Markdown({ hast }: { hast: Root }) {
  return useMemo(() => toJsxRuntime(hast, { Fragment, jsx, jsxs, components, ignoreInvalidStyle: true }), [hast]);
}

// A page arranged by its wiki's layout (ADR-0006): each area of the layout's grid shows one built-in block. The
// page's Markdown is split at its `##` headings, so a `section` block can show one part and `body` the rest. On narrow
// screens the areas stack in reading order.
import type { Root, RootContent } from "hast";
import type { CSSProperties, ReactNode } from "react";
import type { PageData, WikiDetail } from "../../../shared/api.ts";
import { type Block, gridOf, type Layout } from "../../../shared/layout.ts";
import { DesignBlock } from "../../designs/DesignBlock.tsx";
import { DesignsGallery } from "../../designs/DesignsGallery.tsx";
import { api } from "../../lib/api.ts";
import { picture } from "../../lib/base.ts";
import { useResource } from "../../lib/useResource.ts";
import { DirectoryEl, DiscussionsEl, OpenQuestionsEl, OpenTasksEl, RecentChangesEl } from "../home/blocks.tsx";
import { Markdown } from "../markdown/Markdown.tsx";
import { split } from "../markdown/sections.ts";
import { ChildrenEl, TocEl } from "../markdown/universal.tsx";
import { PageInfobox } from "../PageInfobox.tsx";
import { QuestionCard } from "../questions/QuestionCard.tsx";
import { Related } from "../Related.tsx";
import { Zoom } from "../viewer/Zoom.tsx";
import "./layout.css";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const root = (children: RootContent[]): Root => ({ type: "root", children });

/** The layout's blocks in reading order: by where each first appears in the grid. */
function inOrder(layout: Layout): [string, Block][] {
  const order = [...new Set(layout.areas.flat())];
  return order.map((area) => [area, layout.blocks[area]]);
}

export function LayoutView({
  wiki,
  page,
  layout,
}: {
  wiki: WikiDetail;
  page: PageData;
  layout: Layout & { name: string };
}) {
  const grid = gridOf(layout);
  const { intro, sections } = split(page.hast);
  const placed = Object.values(layout.blocks).flatMap((b) => (b.type === "section" ? [b.heading] : []));
  const rest = sections.filter((s) => !placed.some((h) => same(h, s.heading)));

  const show = (block: Block): ReactNode => {
    switch (block.type) {
      case "body":
        return <Markdown hast={root([...intro, ...rest.flatMap((s) => s.nodes)])} />;
      case "section": {
        const found = sections.find((s) => same(s.heading, block.heading));
        if (!found) return <p className="sh-block-empty">There's no “{block.heading}” section on this page yet.</p>;
        // With its own title, the block doesn't repeat the heading.
        return <Markdown hast={root(block.title ? found.nodes.slice(1) : found.nodes)} />;
      }
      case "infobox":
        return <PageInfobox page={page} />;
      case "gallery":
        return <PageGallery wikiId={wiki.id} path={page.path} />;
      case "questions":
      case "suggestions": {
        const kind = block.type === "questions" ? "question" : "suggestion";
        const list = page.questions.filter((q) => q.kind === kind);
        return list.length ? (
          list.map((q) => <QuestionCard key={q.id} question={q} />)
        ) : (
          <p className="sh-block-empty">No {block.type} on this page.</p>
        );
      }
      case "related":
        return <Related wikiId={wiki.id} page={page} />;
      case "children":
        return <ChildrenEl layout={block.style} />;
      case "toc":
        return <TocEl />;
      case "design":
        return <DesignBlock wikiId={wiki.id} design={page.design} />;
      case "designs": {
        const meta = wiki.collections[block.collection];
        return meta ? (
          <DesignsGallery wikiId={wiki.id} collection={block.collection} title={meta.title} item={meta.item} />
        ) : (
          <p className="sh-block-empty">There's no collection “{block.collection}” in wiki.json.</p>
        );
      }
      case "recent-changes":
        return <RecentChangesEl count={block.count ? String(block.count) : undefined} />;
      case "open-questions":
        return <OpenQuestionsEl count={block.count ? String(block.count) : undefined} />;
      case "open-tasks":
        return <OpenTasksEl count={block.count ? String(block.count) : undefined} />;
      case "discussions":
        return <DiscussionsEl count={block.count ? String(block.count) : undefined} />;
      case "directory":
        return <DirectoryEl />;
    }
  };

  return (
    <div
      className="sh-layout"
      data-layout={layout.name}
      style={{ "--areas": grid.areas, "--columns": grid.columns } as CSSProperties}
    >
      {inOrder(layout).map(([area, block]) => (
        <section
          key={area}
          className="sh-layout-area"
          data-block={block.type}
          style={{ "--area": area } as CSSProperties}
        >
          {block.title && <h2 className="sh-layout-title">{block.title}</h2>}
          <div className="sh-layout-body sh-prose">{show(block)}</div>
        </section>
      ))}
    </div>
  );
}

/** The page's pictures as tiles; each opens the image viewer. */
function PageGallery({ wikiId, path }: { wikiId: string; path: string }) {
  const groups = useResource(`images:${wikiId}`, () => api.images(wikiId));
  const images = groups.data?.find((g) => g.page.path === path)?.images ?? [];
  if (!groups.data) return null;
  if (!images.length) return <p className="sh-block-empty">No pictures on this page yet.</p>;
  return (
    <div className="sh-gallery">
      {images.map((i) => (
        <Zoom key={i.src} src={i.src}>
          <img src={picture(i.src, 480)} alt={i.caption ?? ""} loading="lazy" />
        </Zoom>
      ))}
    </div>
  );
}

// A collection's designs (ADR-0006) as a gallery you can sort into groups, nested as deep as you like (Monsters ›
// World 1 › Forest): the groups and designs at one level, a trail back up, and a search with filters that looks
// through every level below. Designs and groups move by dragging them onto a group or the trail, or with "Move to…"
// in their menu. Everyone sees every design (guests: except what the owner hid); the owner and guests on a comment
// link make designs and groups, and change their own (the owner: all).
import { type DragEvent, type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { DesignCollection, DesignGroupInfo, DesignInfo } from "../../shared/api.ts";
import { useGuest } from "../guest/GuestContext.ts";
import { ApiError, api } from "../lib/api.ts";
import { picture } from "../lib/base.ts";
import { useLive } from "../lib/live.ts";
import { useResource } from "../lib/useResource.ts";
import {
  Badge,
  Button,
  cx,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Select,
} from "../ui/index.ts";
import { specialHref } from "../wiki/PageHead.tsx";
import { PageIcon } from "../wiki/PageIcon.tsx";
import { ListSearch } from "../wiki/special/Questions.tsx";
import {
  authors,
  buildTree,
  byName,
  contents,
  NO_FILTERS,
  pathTo,
  placeName,
  type Sort,
  search,
  searching,
  sortDesigns,
  type Tree,
  within,
} from "./collection.ts";
import { MoveDialog, NameDialog, RemoveGroupDialog } from "./GroupDialogs.tsx";
import { type GalleryState, useGallery } from "./useGallery.ts";
import "./designs.css";

export const STATUS: Record<DesignInfo["status"], { label: string; tone: "neutral" | "accent" | "good" }> = {
  draft: { label: "Draft", tone: "neutral" },
  ready: { label: "Ready to add", tone: "accent" },
  done: { label: "In the wiki", tone: "good" },
};

/** A collection's designs and groups, kept live. */
export function useDesigns(wikiId: string, collection: string) {
  const designs = useResource(`designs:${wikiId}:${collection}`, () => api.designs(wikiId, collection));
  const { reload } = designs;
  useLive((e) => {
    if (e.type === "designs" && e.wiki === wikiId) reload();
  });
  return designs;
}

export const designHref = (wikiId: string, d: { collection: string; id: string }) =>
  specialHref(wikiId, "designs", d.collection, d.id);

/** A group on its collection's page. */
export const groupHref = (wikiId: string, collection: string, group: string | null) =>
  `${specialHref(wikiId, "designs", collection)}${group ? `?in=${encodeURIComponent(group)}` : ""}`;

/** What's being dragged onto a group. */
const DRAG = "application/x-shiori-design";
type Dragged = { kind: "design" | "group"; id: string };

interface Ctx {
  wikiId: string;
  collection: string;
  title: string;
  item: string;
  tree: Tree;
  state: GalleryState;
  hrefOf: (at: string | null) => string | null;
  open: (at: string | null) => void;
  /** Moves a design or a group into a group (null: the top). */
  move: (what: Dragged, into: string | null) => void;
  act: (change: () => Promise<unknown>) => Promise<boolean>;
}

export function DesignsGallery({
  wikiId,
  collection,
  title,
  item,
  urlBacked = false,
}: {
  wikiId: string;
  collection: string;
  title: string;
  /** One of them: "Mob". */
  item: string;
  /** The collection's own page: where you are and the search go in the URL. */
  urlBacked?: boolean;
}) {
  const designs = useDesigns(wikiId, collection);
  const { state, set, hrefOf, open } = useGallery(urlBacked);
  const guest = useGuest();
  const canMake = !guest || guest.kind === "comment";
  const [problem, setProblem] = useState("");
  const data = designs.data;
  const tree = useMemo(() => buildTree(data ?? { designs: [], groups: [] }), [data]);
  // A group that was removed or never existed: show the top.
  const at = state.at && tree.groups.has(state.at) ? state.at : null;

  const act = async (change: () => Promise<unknown>) => {
    try {
      await change();
      setProblem("");
      return true;
    } catch (err) {
      setProblem(err instanceof ApiError ? err.detail : "Couldn't save. Check the connection.");
      return false;
    } finally {
      designs.reload();
    }
  };
  const move = (what: Dragged, into: string | null) => {
    if (what.kind === "design") {
      const d = data?.designs.find((x) => x.id === what.id);
      if (!d || tree.placeOf(d) === into) return;
      void act(() => api.changeDesign(wikiId, collection, d.id, { group: into }));
    } else {
      if (tree.parentOf(what.id) === into || what.id === into) return;
      if (within(tree, what.id).has(into)) return setProblem("A group can't go inside itself.");
      void act(() => api.changeGroup(wikiId, collection, what.id, { parent: into }));
    }
  };

  if (designs.error)
    return (
      <p className="sh-block-empty">
        Couldn't load the {title.toLowerCase()}: {designs.error.message}
      </p>
    );
  if (!data) return <div className="sh-designs" aria-busy="true" />;
  const ctx: Ctx = { wikiId, collection, title, item, tree, state: { ...state, at }, hrefOf, open, move, act };
  const found = searching(state);
  return (
    <div className="sh-designs">
      <div className="sh-designs-top">
        {canMake && <Create ctx={ctx} />}
        {(data.designs.length > 0 || data.groups.length > 0) && <Tools ctx={ctx} set={set} />}
      </div>
      {problem && (
        <p className="sh-design-problem" role="alert">
          {problem}
        </p>
      )}
      {!found && (at || data.groups.length > 0) && <Trail ctx={ctx} />}
      {found ? <Results ctx={ctx} set={set} /> : <Level ctx={ctx} canMake={canMake} />}
    </div>
  );
}

/** New group and new design, both in the group being looked at. */
function Create({ ctx }: { ctx: Ctx }) {
  const navigate = useNavigate();
  const [naming, setNaming] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { wikiId, collection, item, state, act, open } = ctx;
  const where = state.at ? ctx.tree.groups.get(state.at)?.name : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    let made: DesignInfo | undefined;
    await act(async () => {
      made = await api.newDesign(wikiId, collection, name.trim(), state.at);
    });
    if (made) navigate(designHref(wikiId, made));
    else setBusy(false);
  };
  return (
    <div className="sh-designs-create">
      {drawing ? (
        <form className="sh-design-new" onSubmit={(e) => void submit(e)}>
          <Input
            autoFocus
            value={name}
            maxLength={80}
            placeholder={`Name the ${item.toLowerCase()}${where ? ` in ${where}` : ""}`}
            aria-label={`Name of the new ${item.toLowerCase()}`}
            onChange={(e) => setName(e.target.value)}
          />
          <Button variant="solid" type="submit" disabled={!name.trim() || busy}>
            Start drawing
          </Button>
          <Button variant="ghost" onClick={() => setDrawing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <Button variant="solid" icon="plus" onClick={() => setDrawing(true)}>
            New {item.toLowerCase()}
          </Button>
          <Button variant="soft" icon="plus" onClick={() => setNaming(true)}>
            {where ? "New group inside" : "New group"}
          </Button>
        </>
      )}
      <NameDialog
        open={naming}
        onOpenChange={setNaming}
        title={where ? `New group in “${where}”` : "New group"}
        action="Make the group"
        onSave={async (groupName) => {
          let made: DesignGroupInfo | undefined;
          const ok = await act(async () => {
            made = await api.newGroup(wikiId, collection, groupName, state.at);
          });
          if (!ok || !made) return;
          setNaming(false);
          // Straight in, so the next group or design goes inside it.
          open(made.id);
        }}
      />
    </div>
  );
}

/** The search box and the filters. */
function Tools({ ctx, set }: { ctx: Ctx; set: (changes: Partial<GalleryState>) => void }) {
  const { state, title, tree } = ctx;
  const all = useMemo(() => [...tree.designs.values()].flat(), [tree]);
  const people = authors(all);
  const sorts: { value: Sort; label: string }[] = [
    { value: "best", label: state.q.trim() ? "Best match" : "Newest first" },
    ...(state.q.trim() ? [{ value: "new" as const, label: "Newest first" }] : []),
    { value: "changed", label: "Recently changed" },
    { value: "old", label: "Oldest first" },
    { value: "name", label: "Name A–Z" },
  ];
  return (
    <div className="sh-designs-tools">
      <ListSearch
        value={state.q}
        onChange={(q) => set({ q })}
        label={`Search the ${title.toLowerCase()}`}
        placeholder="Search names, descriptions, groups, people"
      />
      <Select
        label="Status"
        value={state.status}
        onChange={(status) => set({ status })}
        options={[
          { value: "all", label: "Any status" },
          { value: "draft", label: STATUS.draft.label },
          { value: "ready", label: STATUS.ready.label },
          { value: "done", label: STATUS.done.label },
        ]}
      />
      <Select
        label="Made by"
        value={people.includes(state.by) || state.by === "me" ? state.by : "anyone"}
        onChange={(by) => set({ by })}
        options={[
          { value: "anyone", label: "Made by anyone" },
          { value: "me", label: "Made by you" },
          ...people.map((p) => ({ value: p, label: `Made by ${p}` })),
        ]}
      />
      <Select label="Sort" value={state.sort} onChange={(sort) => set({ sort })} options={sorts} />
    </div>
  );
}

/** Where you are: the collection, then each group down to this one. Each step is also somewhere to drop. */
function Trail({ ctx }: { ctx: Ctx }) {
  const { tree, state, title } = ctx;
  const path = pathTo(tree, state.at);
  const here = path.at(-1);
  return (
    <div className="sh-designs-trail">
      <nav aria-label={`Groups in ${title}`}>
        <ol>
          <li>
            <Step ctx={ctx} to={null} current={!here}>
              <PageIcon icon="home" className="sh-icon-gap" />
              All {title.toLowerCase()}
            </Step>
          </li>
          {path.map((g) => (
            <li key={g.id}>
              <Step ctx={ctx} to={g.id} current={g === here}>
                {g.name}
              </Step>
            </li>
          ))}
        </ol>
      </nav>
      {here?.editable && <GroupMenu ctx={ctx} group={here} label={`Change the group “${here.name}”`} />}
    </div>
  );
}

function Step({ ctx, to, current, children }: { ctx: Ctx; to: string | null; current: boolean; children: ReactNode }) {
  const drop = useDrop(ctx, to);
  const href = ctx.hrefOf(to);
  const cls = cx("sh-designs-step", drop.over && "is-drop");
  if (current)
    return (
      <span className={cls} aria-current="location" {...drop.props}>
        {children}
      </span>
    );
  return href !== null ? (
    <Link to={href} className={cls} {...drop.props}>
      {children}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={() => ctx.open(to)} {...drop.props}>
      {children}
    </button>
  );
}

/** One level: the groups in it, then its designs. */
function Level({ ctx, canMake }: { ctx: Ctx; canMake: boolean }) {
  const { tree, state, title, item } = ctx;
  const groups = tree.children.get(state.at) ?? [];
  const designs = sortDesigns(tree.designs.get(state.at) ?? [], state.sort);
  if (!groups.length && !designs.length)
    return (
      <p className="sh-block-empty">
        {state.at
          ? `This group is empty.${canMake ? ` Make a group inside it, start a ${item.toLowerCase()} here, or drag ${title.toLowerCase()} onto it.` : ""}`
          : `No ${title.toLowerCase()} yet.${canMake ? ` Make groups to sort them (Monsters, World 1, Forest…), then draw and describe each one; an agent makes its page.` : ""}`}
      </p>
    );
  return (
    <>
      {groups.length > 0 && <GroupGrid ctx={ctx} groups={groups} />}
      {designs.length > 0 && <DesignGrid ctx={ctx} designs={designs} />}
    </>
  );
}

/** What the search and filters found, from every level below (or the whole collection). */
function Results({ ctx, set }: { ctx: Ctx; set: (changes: Partial<GalleryState>) => void }) {
  const { tree, state, title } = ctx;
  const found = useMemo(() => search(tree, state.at, state), [tree, state]);
  const where = state.scope === "all" || !state.at ? `all ${title.toLowerCase()}` : `“${placeName(tree, state.at)}”`;
  const n = found.designs.length;
  const g = found.groups.length;
  const counted = [
    `${n} ${n === 1 ? "design" : "designs"}`,
    ...(g ? [`${g} ${g === 1 ? "group" : "groups"}`] : []),
  ].join(" and ");
  return (
    <>
      <div className="sh-designs-found" aria-live="polite">
        <span>
          {counted} in {where}
        </span>
        {state.at && state.scope !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => set({ scope: "all" })}>
            Search all {title.toLowerCase()}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon="close"
          onClick={() => set({ q: "", status: NO_FILTERS.status, by: NO_FILTERS.by, scope: NO_FILTERS.scope })}
        >
          Clear
        </Button>
      </div>
      {g > 0 && <GroupGrid ctx={ctx} groups={found.groups} showPlace />}
      {n > 0 ? (
        <DesignGrid ctx={ctx} designs={found.designs} showPlace />
      ) : (
        !g && <p className="sh-block-empty">Nothing matches. Try other words, or clear the filters.</p>
      )}
    </>
  );
}

function GroupGrid({ ctx, groups, showPlace }: { ctx: Ctx; groups: DesignGroupInfo[]; showPlace?: boolean }) {
  return (
    <ul className="sh-groups-grid" aria-label="Groups">
      {[...groups]
        .sort((a, b) => byName(a.name, b.name))
        .map((g) => (
          <GroupCard key={g.id} ctx={ctx} group={g} showPlace={showPlace} />
        ))}
    </ul>
  );
}

function GroupCard({ ctx, group, showPlace }: { ctx: Ctx; group: DesignGroupInfo; showPlace?: boolean }) {
  const { tree } = ctx;
  const drop = useDrop(ctx, group.id);
  const inside = contents(tree, group.id);
  const href = ctx.hrefOf(group.id);
  const parent = tree.parentOf(group.id);
  const body = (
    <>
      <span className="sh-group-thumbs" data-n={inside.drawings.length}>
        {inside.drawings.length ? (
          inside.drawings.map((d) => (
            <img key={d.id} className="sh-group-thumb" src={picture(d.board as string, 480)} alt="" loading="lazy" />
          ))
        ) : (
          <PageIcon icon="folder" className="sh-design-empty" />
        )}
      </span>
      <span className="sh-group-name">
        <PageIcon icon="folder" className="sh-icon-gap" />
        {group.name}
      </span>
      <span className="sh-design-meta">
        {inside.designs} {inside.designs === 1 ? "design" : "designs"}
        {inside.groups > 0 && ` · ${inside.groups} ${inside.groups === 1 ? "group" : "groups"}`}
        {showPlace && <span className="sh-design-place">in {parent ? placeName(tree, parent) : "the top"}</span>}
      </span>
    </>
  );
  return (
    <li
      className={cx("sh-design-item", drop.over && "is-drop")}
      draggable={group.editable}
      onDragStart={(e) => dragStart(e, { kind: "group", id: group.id })}
      {...drop.props}
    >
      {href !== null ? (
        <Link to={href} className="sh-design-card sh-group-card">
          {body}
        </Link>
      ) : (
        <button type="button" className="sh-design-card sh-group-card" onClick={() => ctx.open(group.id)}>
          {body}
        </button>
      )}
      {group.editable && <GroupMenu ctx={ctx} group={group} label={`More for “${group.name}”`} floating />}
    </li>
  );
}

function DesignGrid({ ctx, designs, showPlace }: { ctx: Ctx; designs: DesignInfo[]; showPlace?: boolean }) {
  return (
    <ul className="sh-designs-grid" aria-label="Designs">
      {designs.map((d) => (
        <DesignCard key={d.id} ctx={ctx} design={d} showPlace={showPlace} />
      ))}
    </ul>
  );
}

function DesignCard({ ctx, design: d, showPlace }: { ctx: Ctx; design: DesignInfo; showPlace?: boolean }) {
  const [moving, setMoving] = useState(false);
  const place = ctx.tree.placeOf(d);
  return (
    <li
      className="sh-design-item"
      draggable={d.editable}
      onDragStart={(e) => dragStart(e, { kind: "design", id: d.id })}
    >
      <Link to={designHref(ctx.wikiId, d)} className="sh-design-card">
        <span className="sh-design-thumb">
          {d.board ? (
            <img src={picture(d.board, 480)} alt="" loading="lazy" />
          ) : (
            <PageIcon icon="pencil" className="sh-design-empty" />
          )}
        </span>
        <span className="sh-design-name">{d.name}</span>
        {showPlace && place && <span className="sh-design-place">in {placeName(ctx.tree, place)}</span>}
        <span className="sh-design-meta">
          <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
          {d.hidden && <Badge tone="warn">Hidden</Badge>}
          <span>{d.mine ? "You" : d.author.name}</span>
        </span>
      </Link>
      {d.editable && (
        <>
          <Menu>
            <MenuTrigger asChild>
              <IconButton icon="dots" label={`More for “${d.name}”`} size="sm" className="sh-design-more" />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem icon="arrowRight" onSelect={() => setMoving(true)}>
                Move to…
              </MenuItem>
            </MenuContent>
          </Menu>
          <MoveDialog
            open={moving}
            onOpenChange={setMoving}
            tree={ctx.tree}
            title={`Move “${d.name}”`}
            collectionTitle={ctx.title}
            current={place}
            onPick={async (to) => {
              if (await ctx.act(() => api.changeDesign(ctx.wikiId, ctx.collection, d.id, { group: to })))
                setMoving(false);
            }}
          />
        </>
      )}
    </li>
  );
}

/** Rename, move and remove a group. */
function GroupMenu({
  ctx,
  group,
  label,
  floating,
}: {
  ctx: Ctx;
  group: DesignGroupInfo;
  label: string;
  /** Over a card's corner, rather than beside the trail. */
  floating?: boolean;
}) {
  const [dialog, setDialog] = useState<"rename" | "move" | "remove" | null>(null);
  const { wikiId, collection, tree, act } = ctx;
  const close = (open: boolean) => !open && setDialog(null);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton icon="dots" label={label} size="sm" className={floating ? "sh-design-more" : undefined} />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon="edit" onSelect={() => setDialog("rename")}>
            Rename
          </MenuItem>
          <MenuItem icon="arrowRight" onSelect={() => setDialog("move")}>
            Move to…
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon="trash" danger onSelect={() => setDialog("remove")}>
            Remove the group
          </MenuItem>
        </MenuContent>
      </Menu>
      <NameDialog
        open={dialog === "rename"}
        onOpenChange={close}
        title={`Rename “${group.name}”`}
        initial={group.name}
        action="Rename"
        onSave={async (name) => {
          if (await act(() => api.changeGroup(wikiId, collection, group.id, { name }))) setDialog(null);
        }}
      />
      <MoveDialog
        open={dialog === "move"}
        onOpenChange={close}
        tree={tree}
        title={`Move “${group.name}”`}
        collectionTitle={ctx.title}
        current={tree.parentOf(group.id)}
        moving={group.id}
        onPick={async (to) => {
          if (await act(() => api.changeGroup(wikiId, collection, group.id, { parent: to }))) setDialog(null);
        }}
      />
      <RemoveGroupDialog
        open={dialog === "remove"}
        onOpenChange={close}
        tree={tree}
        group={group}
        collectionTitle={ctx.title}
        onRemove={async () => {
          const up = tree.parentOf(group.id);
          if (!(await act(() => api.removeGroup(wikiId, collection, group.id)))) return;
          setDialog(null);
          // Removing the group you're in takes you to where its contents went.
          if (ctx.state.at === group.id) ctx.open(up);
        }}
      />
    </>
  );
}

function dragStart(e: DragEvent, what: Dragged) {
  e.dataTransfer.setData(DRAG, JSON.stringify(what));
  e.dataTransfer.effectAllowed = "move";
}

/** A group (or the top) that designs and groups can be dropped on. */
function useDrop(ctx: Ctx, target: string | null) {
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(DRAG);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          const what = JSON.parse(e.dataTransfer.getData(DRAG)) as Dragged;
          if (what.kind === "group" && what.id === target) return;
          ctx.move(what, target);
        } catch {}
      },
    },
  };
}

/** For the design page: a collection's tree, kept live. */
export function useTree(wikiId: string, collection: string): Tree | null {
  const designs = useDesigns(wikiId, collection);
  const data: DesignCollection | undefined = designs.data;
  return useMemo(() => (data ? buildTree(data) : null), [data]);
}

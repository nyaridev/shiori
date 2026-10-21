// One design (ADR-0006), at /w/<wiki>/_/designs/<collection>/<id>: its name, the drawing board, a description and
// reference pictures, all saved as you go. "Ready to add" tells the agent to make its page; the agent's note and the
// page show here once it has. The owner may change any design and hide a guest's from guests; a guest only their own.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { DesignInfo, WikiDetail } from "../../shared/api.ts";
import { useGuest } from "../guest/GuestContext.ts";
import { ApiError, api } from "../lib/api.ts";
import { picture } from "../lib/base.ts";
import { useLive } from "../lib/live.ts";
import { ago } from "../lib/time.ts";
import { useResource } from "../lib/useResource.ts";
import {
  Badge,
  Button,
  Callout,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  IconButton,
  Input,
  Textarea,
} from "../ui/index.ts";
import { Crumbs, pageHref, specialHref } from "../wiki/PageHead.tsx";
import { useWikiIndex } from "../wiki/WikiIndexContext.ts";
import { Board } from "./Board.tsx";
import { STATUS } from "./DesignsGallery.tsx";
import "./designs.css";

const PICTURES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** How long after typing stops the text is saved. */
const SETTLE = 800;

export function DesignPage({ wiki, collection, id }: { wiki: WikiDetail; collection: string; id: string }) {
  const meta = wiki.collections[collection];
  const pages = useWikiIndex();
  const loaded = useResource(`design:${wiki.id}:${collection}:${id}`, () => api.design(wiki.id, collection, id));
  const [design, setDesign] = useState<DesignInfo | null>(null);
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const { reload } = loaded;
  useEffect(() => {
    if (loaded.data) setDesign(loaded.data);
  }, [loaded.data]);
  useLive((e) => {
    if (e.type === "designs" && e.wiki === wiki.id) reload();
  });
  useEffect(() => {
    if (design) document.title = `${design.name} · ${meta?.title ?? collection} · ${wiki.title}`;
  }, [design, meta, collection, wiki.title]);

  /** Runs a change, then shows the design as the server has it now. */
  const run = useCallback(async (change: () => Promise<DesignInfo | undefined>) => {
    setSaving(true);
    try {
      const next = await change();
      if (next) setDesign(next);
      setProblem("");
    } catch (err) {
      setProblem(err instanceof ApiError ? err.detail : "Couldn't save. Check the connection.");
    } finally {
      setSaving(false);
    }
  }, []);

  const trail = [
    { path: "", title: "Home", icon: "home", isPage: true },
    { path: `_/designs/${collection}`, title: meta?.title ?? collection, icon: "pencil", isPage: true },
  ];

  if (loaded.error || !meta) {
    return (
      <main className="sh-wiki-main sh-special">
        <header className="sh-page-head">
          <Crumbs wikiId={wiki.id} trail={trail} />
          <h1 className="sh-page-title">No such design</h1>
          <p className="sh-page-summary">It was removed, hidden, or the link is wrong.</p>
        </header>
        <Link to={specialHref(wiki.id, "designs", collection)} className="sh-link">
          Back to the {meta?.title.toLowerCase() ?? "designs"}
        </Link>
      </main>
    );
  }
  if (!design) return <main className="sh-wiki-main sh-special" />;

  const edit = design.editable;
  const ids = [wiki.id, collection, id] as const;
  return (
    <main className="sh-wiki-main sh-special sh-design-page" data-path={`_/designs/${collection}/${id}`}>
      <header className="sh-page-head">
        <Crumbs wikiId={wiki.id} trail={trail} />
        <p className="sh-special-kicker">{meta.item}</p>
        {edit ? (
          <NameField
            key={design.id}
            value={design.name}
            onSave={(name) => run(() => api.changeDesign(...ids, { name }))}
          />
        ) : (
          <h1 className="sh-page-title">{design.name}</h1>
        )}
        <div className="sh-page-meta">
          <Badge tone={STATUS[design.status].tone}>{STATUS[design.status].label}</Badge>
          {design.hidden && <Badge tone="warn">Hidden from guests</Badge>}
          <span>
            by {design.mine ? "you" : design.author.name} · started {ago(design.createdAt)} · changed{" "}
            {ago(design.updatedAt)}
          </span>
          {saving && <span className="sh-design-saving">Saving…</span>}
        </div>
      </header>

      {problem && <Callout tone="danger">{problem}</Callout>}
      {design.status === "done" && (
        <Callout tone="tip" title="In the wiki">
          {design.page !== null && (
            <>
              It became{" "}
              <Link to={pageHref(wiki.id, design.page)} className="sh-link">
                {pages?.byPath.get(design.page)?.title ?? (design.page || "the home page")}
              </Link>
              .{" "}
            </>
          )}
          {design.note}
        </Callout>
      )}

      <div className="sh-design-layout">
        <section className="sh-design-board" aria-label="Drawing">
          <Board
            src={design.board ? picture(design.board, 1600) : null}
            editable={edit}
            onSave={(png) => run(() => api.saveBoard(...ids, png))}
          />
        </section>
        <aside className="sh-design-side">
          <Status design={design} edit={edit} onChange={(status) => run(() => api.changeDesign(...ids, { status }))} />
          <section>
            <h2 className="sh-rail-title">Description</h2>
            {edit ? (
              <DescriptionField
                key={design.id}
                value={design.description}
                onSave={(description) => run(() => api.changeDesign(...ids, { description }))}
              />
            ) : (
              <p className="sh-design-text">{design.description || "No description yet."}</p>
            )}
          </section>
          <Pictures
            design={design}
            edit={edit}
            onAdd={(file, caption) => run(() => api.addPicture(...ids, file, caption))}
            onRemove={(file) => run(() => api.removePicture(...ids, file))}
          />
          <Manage wiki={wiki} design={design} edit={edit} run={run} />
        </aside>
      </div>
    </main>
  );
}

function NameField({ value, onSave }: { value: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(value);
  const save = () => {
    const next = name.trim();
    if (next && next !== value) onSave(next);
    else setName(value);
  };
  return (
    <input
      className="sh-page-title sh-design-name-field"
      value={name}
      maxLength={80}
      aria-label="Name"
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function DescriptionField({ value, onSave }: { value: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const last = useRef(value);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (next === last.current) return;
      last.current = next;
      onSave(next);
    }, SETTLE);
  };
  return (
    <Textarea
      value={text}
      rows={8}
      maxLength={8000}
      placeholder="What it is, how it looks, what it does. Anything the drawing doesn't say."
      aria-label="Description"
      onChange={(e) => change(e.target.value)}
    />
  );
}

function Status({
  design,
  edit,
  onChange,
}: {
  design: DesignInfo;
  edit: boolean;
  onChange: (status: "draft" | "ready") => void;
}) {
  if (!edit || design.status === "done") return null;
  return design.status === "draft" ? (
    <Callout tone="note">
      Still drawing? It saves as you go. When it's ready, tell the agent:
      <div className="sh-design-actions">
        <Button variant="solid" onClick={() => onChange("ready")}>
          Ready to add
        </Button>
      </div>
    </Callout>
  ) : (
    <Callout tone="tip" title="Ready to add">
      An agent will make its page. Want to change something first?
      <div className="sh-design-actions">
        <Button variant="soft" icon="undo" onClick={() => onChange("draft")}>
          Back to draft
        </Button>
      </div>
    </Callout>
  );
}

function Pictures({
  design,
  edit,
  onAdd,
  onRemove,
}: {
  design: DesignInfo;
  edit: boolean;
  onAdd: (file: Blob, caption: string) => void;
  onRemove: (file: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLElement>(null);
  const [caption, setCaption] = useState("");
  const add = useRef((_files: Iterable<File>) => {});
  add.current = (files) => {
    for (const f of files) if (PICTURES.includes(f.type)) onAdd(f, caption);
    setCaption("");
  };
  // Pictures dropped on the section or pasted into it are added too.
  useEffect(() => {
    const el = area.current;
    if (!el || !edit) return;
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) add.current(e.dataTransfer.files);
    };
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => PICTURES.includes(f.type));
      if (!files.length) return;
      e.preventDefault();
      add.current(files);
    };
    el.addEventListener("dragover", over);
    el.addEventListener("drop", drop);
    el.addEventListener("paste", paste);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("drop", drop);
      el.removeEventListener("paste", paste);
    };
  }, [edit]);
  if (!edit && !design.images.length) return null;
  return (
    <section ref={area}>
      <h2 className="sh-rail-title">Pictures</h2>
      <ul className="sh-design-pictures">
        {design.images.map((i) => (
          <li key={i.file}>
            <a href={picture(i.url, 1600)} target="_blank" rel="noreferrer">
              <img src={picture(i.url, 480)} alt={i.caption} loading="lazy" />
            </a>
            {i.caption && <span>{i.caption}</span>}
            {edit && <IconButton icon="close" label="Remove the picture" size="sm" onClick={() => onRemove(i.file)} />}
          </li>
        ))}
      </ul>
      {edit && (
        <div className="sh-design-add">
          <Input
            value={caption}
            maxLength={200}
            placeholder="Caption (optional)"
            aria-label="Caption for the next picture"
            onChange={(e) => setCaption(e.target.value)}
          />
          <Button variant="soft" icon="plus" onClick={() => input.current?.click()}>
            Add pictures
          </Button>
          <input
            ref={input}
            type="file"
            accept={PICTURES.join(",")}
            multiple
            hidden
            onChange={(e) => e.target.files && add.current(e.target.files)}
          />
          <p className="sh-design-hint">Or drop or paste them here. PNG, JPEG, WebP or GIF.</p>
        </div>
      )}
    </section>
  );
}

/** Hiding a guest's design (the owner) and removing it (whoever may change it). */
function Manage({
  wiki,
  design,
  edit,
  run,
}: {
  wiki: WikiDetail;
  design: DesignInfo;
  edit: boolean;
  run: (change: () => Promise<DesignInfo | undefined>) => Promise<void>;
}) {
  const guest = useGuest();
  const navigate = useNavigate();
  const ids = [wiki.id, design.collection, design.id] as const;
  const canHide = !guest && design.author.kind === "guest";
  if (!edit && !canHide) return null;
  return (
    <section className="sh-design-manage">
      {canHide && (
        <Button
          variant="ghost"
          icon={design.hidden ? "eye" : "eyeOff"}
          onClick={() => run(() => api.hideDesign(...ids, !design.hidden))}
        >
          {design.hidden ? "Show to guests" : "Hide from guests"}
        </Button>
      )}
      {edit && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" icon="trash">
              Remove
            </Button>
          </DialogTrigger>
          <DialogContent
            title={`Remove “${design.name}”?`}
            description="It moves to the wiki's designs/_removed/ folder."
          >
            <div className="sh-design-actions">
              <DialogClose asChild>
                <Button variant="ghost">Keep it</Button>
              </DialogClose>
              <Button
                variant="solid"
                onClick={() =>
                  run(async () => {
                    await api.removeDesign(...ids);
                    navigate(specialHref(wiki.id, "designs", design.collection));
                    return undefined;
                  })
                }
              >
                Remove
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

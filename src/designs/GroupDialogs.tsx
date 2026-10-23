// The dialogs that sort a collection (ADR-0006, groups): naming a group, picking where a design or a group goes, and
// removing a group (what's in it moves up a level).
import { type CSSProperties, type FormEvent, useMemo, useState } from "react";
import type { DesignGroupInfo } from "../../shared/api.ts";
import { Button, Dialog, DialogClose, DialogContent, Input } from "../ui/index.ts";
import { PageIcon } from "../wiki/PageIcon.tsx";
import { contents, pathTo, type Tree, within } from "./collection.ts";

const GROUP_NAME = 60;

/** A dialog that asks for a group's name: a new group's, or a new name for one. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  initial = "",
  action,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: string;
  action: string;
  onSave: (name: string) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title={title}>
          <NameForm initial={initial} action={action} onSave={onSave} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function NameForm({
  initial,
  action,
  onSave,
}: {
  initial: string;
  action: string;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    await onSave(name.trim());
    setBusy(false);
  };
  return (
    <form className="sh-group-form" onSubmit={(e) => void submit(e)}>
      <Input
        autoFocus
        value={name}
        maxLength={GROUP_NAME}
        placeholder="Monsters, World 1, Forest…"
        aria-label="Group name"
        onChange={(e) => setName(e.target.value)}
      />
      <div className="sh-design-actions">
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button variant="solid" type="submit" disabled={!name.trim() || name.trim() === initial || busy}>
          {action}
        </Button>
      </div>
    </form>
  );
}

/**
 * Picks where something goes: the top of the collection or any group, shown as a tree. Moving a group leaves out the
 * group itself and everything under it.
 */
export function MoveDialog({
  open,
  onOpenChange,
  tree,
  title,
  collectionTitle,
  current,
  moving,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tree: Tree;
  title: string;
  collectionTitle: string;
  /** Where it is now. */
  current: string | null;
  /** The group being moved, when it's a group. */
  moving?: string;
  onPick: (group: string | null) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title={title} description="Pick the group it goes in." size="lg">
          <MovePicker tree={tree} collectionTitle={collectionTitle} current={current} moving={moving} onPick={onPick} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function MovePicker({
  tree,
  collectionTitle,
  current,
  moving,
  onPick,
}: {
  tree: Tree;
  collectionTitle: string;
  current: string | null;
  moving?: string;
  onPick: (group: string | null) => Promise<void>;
}) {
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => {
    const blocked = moving ? within(tree, moving) : new Set<string | null>();
    const out: { group: DesignGroupInfo; depth: number }[] = [];
    const walk = (at: string | null, depth: number) => {
      for (const g of tree.children.get(at) ?? []) {
        if (blocked.has(g.id)) continue;
        out.push({ group: g, depth });
        walk(g.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [tree, moving]);
  const f = filter.trim().toLowerCase();
  // Filtering shows each match with its whole path, so groups of the same name tell apart.
  const shown = f ? rows.filter((r) => r.group.name.toLowerCase().includes(f)) : rows;
  const pick = async (group: string | null) => {
    setBusy(true);
    await onPick(group);
    setBusy(false);
  };
  const row = (id: string | null, label: string, depth: number, hint?: string) => (
    <li key={id ?? "top"}>
      <button
        type="button"
        className="sh-move-row"
        style={{ "--depth": depth } as CSSProperties}
        disabled={busy || id === current}
        aria-current={id === current || undefined}
        onClick={() => void pick(id)}
      >
        <PageIcon icon={id ? "folder" : "home"} className="sh-move-icon" />
        <span className="sh-move-name">{label}</span>
        {hint && <span className="sh-move-hint">{hint}</span>}
        {id === current && <span className="sh-move-hint">Here now</span>}
      </button>
    </li>
  );
  return (
    <div className="sh-move">
      {rows.length > 8 && (
        <Input
          type="search"
          autoFocus
          value={filter}
          placeholder="Find a group"
          aria-label="Find a group"
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <ul className="sh-move-list">
        {!f && row(null, `Top of ${collectionTitle}`, 0)}
        {shown.map(({ group, depth }) => {
          const n = contents(tree, group.id).designs;
          const path = pathTo(tree, tree.parentOf(group.id))
            .map((g) => g.name)
            .join(" / ");
          return row(group.id, group.name, f ? 0 : depth, f ? path : n ? String(n) : undefined);
        })}
      </ul>
      {f && !shown.length && <p className="sh-design-hint">No group is called that.</p>}
    </div>
  );
}

/** Asks before removing a group, saying where what's in it goes. */
export function RemoveGroupDialog({
  open,
  onOpenChange,
  tree,
  group,
  collectionTitle,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tree: Tree;
  group: DesignGroupInfo;
  collectionTitle: string;
  onRemove: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const parent = tree.parentOf(group.id);
  const where = parent ? `“${tree.groups.get(parent)?.name}”` : `the top of ${collectionTitle}`;
  const directGroups = tree.children.get(group.id)?.length ?? 0;
  const directDesigns = tree.designs.get(group.id)?.length ?? 0;
  const parts = [
    directDesigns ? `${directDesigns} design${directDesigns === 1 ? "" : "s"}` : "",
    directGroups ? `${directGroups} group${directGroups === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title={`Remove the group “${group.name}”?`}
          description={
            parts.length
              ? `Nothing in it is removed: its ${parts.join(" and ")} move up to ${where}.`
              : "It's empty. Its file moves to the wiki's designs/_removed/ folder."
          }
        >
          <div className="sh-design-actions">
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <Button
              variant="solid"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onRemove();
                setBusy(false);
              }}
            >
              Remove the group
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

// A collection's designs (ADR-0006) as a gallery: each one's drawing, name, where it stands and who made it, and the
// button that starts a new one. Everyone sees every design (guests: except what the owner hid); the owner and guests
// on a comment link can make one.
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { DesignInfo } from "../../shared/api.ts";
import { useGuest } from "../guest/GuestContext.ts";
import { ApiError, api } from "../lib/api.ts";
import { picture } from "../lib/base.ts";
import { useLive } from "../lib/live.ts";
import { useResource } from "../lib/useResource.ts";
import { Badge, Button, Input } from "../ui/index.ts";
import { specialHref } from "../wiki/PageHead.tsx";
import { PageIcon } from "../wiki/PageIcon.tsx";
import "./designs.css";

export const STATUS: Record<DesignInfo["status"], { label: string; tone: "neutral" | "accent" | "good" }> = {
  draft: { label: "Draft", tone: "neutral" },
  ready: { label: "Ready to add", tone: "accent" },
  done: { label: "In the wiki", tone: "good" },
};

/** A collection's designs, kept live. */
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

export function DesignsGallery({
  wikiId,
  collection,
  title,
  item,
}: {
  wikiId: string;
  collection: string;
  title: string;
  /** One of them: "Mob". */
  item: string;
}) {
  const designs = useDesigns(wikiId, collection);
  const guest = useGuest();
  const canMake = !guest || guest.kind === "comment";
  if (designs.error)
    return (
      <p className="sh-block-empty">
        Couldn't load the {title.toLowerCase()}: {designs.error.message}
      </p>
    );
  return (
    <div className="sh-designs">
      {canMake && <NewDesign wikiId={wikiId} collection={collection} item={item} />}
      {designs.data && !designs.data.length && (
        <p className="sh-block-empty">
          No {title.toLowerCase()} yet.{canMake ? ` Start one: draw it, describe it, and an agent makes its page.` : ""}
        </p>
      )}
      <ul className="sh-designs-grid">
        {designs.data?.map((d) => (
          <li key={d.id}>
            <Link to={designHref(wikiId, d)} className="sh-design-card">
              <span className="sh-design-thumb">
                {d.board ? (
                  <img src={picture(d.board, 480)} alt="" loading="lazy" />
                ) : (
                  <PageIcon icon="pencil" className="sh-design-empty" />
                )}
              </span>
              <span className="sh-design-name">{d.name}</span>
              <span className="sh-design-meta">
                <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                {d.hidden && <Badge tone="warn">Hidden</Badge>}
                <span>{d.mine ? "You" : d.author.name}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewDesign({ wikiId, collection, item }: { wikiId: string; collection: string; item: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const d = await api.newDesign(wikiId, collection, name.trim());
      navigate(designHref(wikiId, d));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.detail : "Couldn't make it. Try again in a moment.");
      setBusy(false);
    }
  };
  if (!open)
    return (
      <Button variant="solid" icon="plus" onClick={() => setOpen(true)}>
        New {item.toLowerCase()}
      </Button>
    );
  return (
    <form className="sh-design-new" onSubmit={(e) => void submit(e)}>
      <Input
        autoFocus
        value={name}
        maxLength={80}
        placeholder={`Name the ${item.toLowerCase()}`}
        aria-label={`Name of the new ${item.toLowerCase()}`}
        onChange={(e) => setName(e.target.value)}
      />
      <Button variant="solid" type="submit" disabled={!name.trim() || busy}>
        Start drawing
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {problem && (
        <p className="sh-design-problem" role="alert">
          {problem}
        </p>
      )}
    </form>
  );
}

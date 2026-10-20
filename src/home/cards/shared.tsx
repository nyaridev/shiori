// Parts every Character card variant uses.
// The base styles load here, before any variant's own CSS, so variants can override them.
import type { WikiCard } from "../../../shared/api.ts";
import "./cards.css";
import "./character.css";

export interface CardProps {
  card: WikiCard;
}

export const initialOf = (title: string) => [...title][0]?.toUpperCase() ?? "?";

/** Five stars; each is its own span so variants can animate them one by one. */
export function Stars({ className = "gc-stars" }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} style={{ "--i": i } as React.CSSProperties}>
          ★
        </span>
      ))}
    </span>
  );
}

/** The element badge in the corner: the wiki's initial in a ring of its accent. */
export function Badge({ title }: { title: string }) {
  return <span className="gc-badge">{initialOf(title)}</span>;
}

/** The art on its rarity gradient, fading out at the bottom. */
export function Art({ card, children }: { card: WikiCard; children?: React.ReactNode }) {
  return (
    <div className="gc-art">
      <img className="card-fill gc-img" src={card.coverUrl} alt="" draggable={false} />
      {children}
    </div>
  );
}

/** A small deterministic random generator, so each wiki gets its own (stable) pattern. */
export function seeded(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

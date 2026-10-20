// A modern take: full-bleed art inside a gold rarity rim, and a frosted name plate floating over the bottom.
import { Badge, type CardProps, Stars } from "./shared.tsx";
import "./glass.css";

export function Glass({ card }: CardProps) {
  return (
    <div className="gc gc-gl">
      <img className="card-fill" src={card.coverUrl} alt="" draggable={false} />
      <Badge title={card.title} />
      <div className="gc-gl-plate">
        <Stars className="gc-stars gc-gl-stars" />
        <span className="gc-name">{card.title}</span>
        {card.tagline && <span className="gc-gl-tagline">{card.tagline}</span>}
      </div>
    </div>
  );
}

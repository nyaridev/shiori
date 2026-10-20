// Character list card: the level (page count) and stars on the art, a textured rarity backdrop, and a two-line
// plate with the tagline.
import { Art, Badge, type CardProps, Stars } from "./shared.tsx";
import "./level.css";

export function Level({ card }: CardProps) {
  return (
    <div className="gc gc-lv">
      <Art card={card}>
        <Badge title={card.title} />
        <span className="gc-level">Lv. {card.pages}</span>
        <Stars className="gc-stars gc-lv-stars" />
      </Art>
      <div className="gc-plate gc-lv-plate">
        <span className="gc-name">{card.title}</span>
        {card.tagline && <span className="gc-lv-tagline">{card.tagline}</span>}
      </div>
    </div>
  );
}

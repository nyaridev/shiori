// Party setup card: a dark slate plate with the name and level, and a gold marker above the selected card.
import { Art, Badge, type CardProps, Stars } from "./shared.tsx";
import "./party.css";

export function Party({ card }: CardProps) {
  return (
    <div className="gc gc-pa">
      <span className="gc-pa-marker" />
      <Art card={card}>
        <Badge title={card.title} />
        <Stars />
      </Art>
      <div className="gc-plate gc-pa-plate">
        <span className="gc-name">{card.title}</span>
        <span className="gc-pa-level">Lv. {card.pages}</span>
      </div>
    </div>
  );
}

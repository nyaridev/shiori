// Genshin's character card: art on a rarity gradient with a rounded corner, five stars, a cream name plate.
import { type CardProps, initialOf } from "./shared.ts";
import "./genshin-character.css";

export function GenshinCharacter({ card }: CardProps) {
  return (
    <div className="gc">
      <div className="gc-art">
        <img className="card-fill" src={card.coverUrl} alt="" draggable={false} />
        <span className="gc-element">{initialOf(card.title)}</span>
        <span className="gc-stars" aria-hidden="true">
          ★★★★★
        </span>
      </div>
      <div className="gc-plate">
        <span className="gc-name">{card.title}</span>
      </div>
    </div>
  );
}

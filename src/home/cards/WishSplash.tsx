// The card you get on a wish: light rays turning behind the art, a gold rim, and stars that pop in one by one when
// the card reaches the center.
import { Art, Badge, type CardProps, Stars } from "./shared.tsx";
import "./wish-splash.css";

export function WishSplash({ card }: CardProps) {
  return (
    <div className="gc gc-ws">
      <Art card={card}>
        <span className="gc-ws-rays" />
        <Badge title={card.title} />
      </Art>
      <div className="gc-plate gc-ws-plate">
        <Stars className="gc-stars gc-ws-stars" />
        <span className="gc-name">{card.title}</span>
      </div>
    </div>
  );
}

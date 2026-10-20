// A Genshin wish banner: full art in a navy and gold double frame, corner brackets, gems, a centered title.
import type { CardProps } from "./shared.ts";
import "./genshin-wish.css";

export function GenshinWish({ card }: CardProps) {
  return (
    <div className="gw">
      <img className="card-fill" src={card.coverUrl} alt="" draggable={false} />
      <span className="gw-shade" />
      <span className="gw-frame" />
      <span className="gw-corners" />
      <span className="gw-gem gw-gem-top" />
      <span className="gw-gem gw-gem-bottom" />
      <div className="gw-text">
        <span className="gw-kicker">Wiki</span>
        <span className="gw-title">{card.title}</span>
        <span className="gw-divider">
          <i />
        </span>
        {card.tagline && <span className="gw-tagline card-clamp">{card.tagline}</span>}
      </div>
      <span className="card-shine" />
    </div>
  );
}

// Genshin's parchment menus: cream paper, a gold double border, the art in an inset window, slate text.
import type { CardProps } from "./shared.ts";
import "./genshin-paper.css";

export function GenshinPaper({ card }: CardProps) {
  return (
    <div className="gp">
      <div className="gp-window">
        <img className="card-fill" src={card.coverUrl} alt="" draggable={false} />
      </div>
      <div className="gp-body">
        <span className="gp-title">{card.title}</span>
        <span className="gp-divider">
          <i />
        </span>
        {card.tagline && <span className="gp-tagline card-clamp">{card.tagline}</span>}
      </div>
    </div>
  );
}

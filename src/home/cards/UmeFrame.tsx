// ume-sync's "frame": deep ink panel, gold corner filigree, Cinzel title over a gold ornament line.
import type { CardProps } from "./shared.ts";
import "./ume-frame.css";

export function UmeFrame({ card }: CardProps) {
  return (
    <div className="uf">
      <div className="uf-art">
        <img className="card-fill" src={card.coverUrl} alt="" draggable={false} />
      </div>
      <div className="uf-body">
        <span className="uf-label">Wiki · {card.source}</span>
        <span className="uf-title">{card.title}</span>
        <span className="uf-ornament" />
        {card.tagline && <span className="uf-tagline card-clamp">{card.tagline}</span>}
      </div>
      <span className="card-shine" />
    </div>
  );
}

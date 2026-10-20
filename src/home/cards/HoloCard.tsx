// A foil trading card in ume gold: the rainbow foil and the glare slide as the card moves through the deck.
import { type CardProps, initialOf } from "./shared.ts";
import "./holo.css";

export function HoloCard({ card }: CardProps) {
  return (
    <div className="ho">
      <div className="ho-panel">
        <header className="ho-top">
          <span className="ho-name">{card.title}</span>
          <span className="ho-gem">{initialOf(card.title)}</span>
        </header>
        <div className="ho-art">
          <img className="card-fill" src={card.coverUrl} alt="" draggable={false} />
          <span className="ho-foil" />
        </div>
        <p className="ho-text card-clamp">{card.tagline || "A Loredeck wiki."}</p>
        <footer className="ho-foot">
          <span>Wiki</span>
          <span>{card.source}</span>
        </footer>
      </div>
      <span className="ho-glare" />
    </div>
  );
}

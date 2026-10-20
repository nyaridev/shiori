// ume-sync's project card, stood up: a glowing slot badge, name and path, the cover in a sunken well, status chips.
import { type CardProps, initialOf } from "./shared.ts";
import "./ume-slot.css";

export function UmeSlot({ card }: CardProps) {
  return (
    <div className="us">
      <header className="us-head">
        <span className="us-slot">{initialOf(card.title)}</span>
        <span className="us-id">
          <span className="us-name">{card.title}</span>
          <span className="us-path">wikis/{card.id}</span>
        </span>
      </header>
      <div className="us-well">
        <img className="card-fill" src={card.coverUrl} alt="" draggable={false} />
      </div>
      {card.tagline && <p className="us-tagline card-clamp">{card.tagline}</p>}
      <footer className="us-chips">
        <span className="us-chip us-ok">
          <i />
          Ready
        </span>
        <span className="us-chip">{card.source}</span>
        <span className="us-chip us-open">Open ›</span>
      </footer>
      <span className="card-shine" />
    </div>
  );
}

// The plain Character card: art on the rarity gradient, element badge, five stars, cream name plate.
import { Art, Badge, type CardProps, Stars } from "./shared.tsx";

export function Classic({ card }: CardProps) {
  return (
    <div className="gc">
      <Art card={card}>
        <Badge title={card.title} />
        <Stars />
      </Art>
      <div className="gc-plate">
        <span className="gc-name">{card.title}</span>
      </div>
    </div>
  );
}

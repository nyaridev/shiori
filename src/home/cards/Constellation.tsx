// Character card with a constellation drawn behind the art. Each wiki gets its own star pattern, seeded by its id;
// the centered card's stars twinkle.
import { useMemo } from "react";
import { Art, Badge, type CardProps, Stars, seeded } from "./shared.tsx";
import "./constellation.css";

function pattern(id: string) {
  const rand = seeded(id);
  const points = Array.from({ length: 6 }, (_, i) => ({
    x: 12 + (i / 5) * 76 + (rand() - 0.5) * 14,
    y: 14 + rand() * 46,
    r: 0.7 + rand() * 0.8,
  }));
  return { points, line: points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") };
}

export function Constellation({ card }: CardProps) {
  const { points, line } = useMemo(() => pattern(card.id), [card.id]);
  return (
    <div className="gc gc-co">
      <Art card={card}>
        <svg className="gc-co-sky" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <polyline points={line} />
          {points.map((p, i) => (
            <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r={p.r} style={{ "--i": i } as React.CSSProperties} />
          ))}
        </svg>
        <Badge title={card.title} />
        <Stars />
      </Art>
      <div className="gc-plate">
        <span className="gc-name">{card.title}</span>
      </div>
    </div>
  );
}

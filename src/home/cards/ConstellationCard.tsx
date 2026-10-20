// The deck card (after Genshin's character cards): the art on a night-violet backdrop, a constellation that draws
// itself in, glimmers, fades and is replaced by a new random one, and a cream name plate.
import { useEffect, useMemo, useState } from "react";
import type { WikiCard } from "../../../shared/api.ts";
import "./card.css";

interface Star {
  x: number;
  y: number;
  r: number;
}

/** 5–7 stars spread left to right across the upper part of the art, joined in order. */
function randomConstellation(): Star[] {
  const count = 5 + Math.floor(Math.random() * 3);
  return Array.from({ length: count }, (_, i) => ({
    x: 12 + (i / (count - 1)) * 76 + (Math.random() - 0.5) * 16,
    y: 12 + Math.random() * 50,
    r: 0.6 + Math.random() * 0.7,
  }));
}

/** How long one constellation stays before the next one replaces it (ms), and its fade-out. */
const life = () => 9000 + Math.random() * 7000;
const FADE = 900;

function useConstellation() {
  const [generation, setGeneration] = useState(0);
  const [leaving, setLeaving] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new generation draws a new constellation.
  const stars = useMemo(randomConstellation, [generation]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each generation schedules the next one.
  useEffect(() => {
    let swap = 0;
    const fade = window.setTimeout(() => {
      setLeaving(true);
      swap = window.setTimeout(() => {
        setLeaving(false);
        setGeneration((g) => g + 1);
      }, FADE);
    }, life());
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(swap);
    };
  }, [generation]);
  return { stars, generation, leaving };
}

export function ConstellationCard({ card }: { card: WikiCard }) {
  const { stars, generation, leaving } = useConstellation();
  const line = stars.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(" ");

  return (
    <div className="cc">
      <div className="cc-art">
        <img className="cc-fill cc-img" src={card.coverUrl} alt="" draggable={false} />
        <svg
          key={generation}
          className="cc-sky"
          data-leaving={leaving || undefined}
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <polyline className="cc-line" points={line} pathLength={1} />
          {stars.map((s, i) => (
            <circle
              // biome-ignore lint/suspicious/noArrayIndexKey: stars never reorder within a constellation.
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              style={{ "--i": i, "--n": stars.length } as React.CSSProperties}
            />
          ))}
        </svg>
      </div>
      <div className="cc-plate">
        <span className="cc-name">{card.title}</span>
      </div>
    </div>
  );
}

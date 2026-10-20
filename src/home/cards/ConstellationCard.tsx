// The deck card (after Genshin's character cards): the art on a night-violet backdrop and a living constellation.
// Each cycle the stars fade in, the lines trace outward from the first star (each star flares as a line reaches it),
// a shooting star may cross, then it all fades and a new random constellation takes its place.
import { useEffect, useId, useMemo, useState } from "react";
import type { WikiCard } from "../../../shared/api.ts";
import { type Sky, skyFor } from "./sky.ts";
import "./card.css";

/** How long one constellation stays (ms) before the next one, and how long it takes to fade. */
const life = () => 11000 + Math.random() * 7000;
const FADE = 1200;

function useSky(): { sky: Sky; generation: number; leaving: boolean } {
  const [generation, setGeneration] = useState(0);
  const [leaving, setLeaving] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new generation draws a new sky.
  const sky = useMemo(skyFor, [generation]);
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
  return { sky, generation, leaving };
}

const delay = (s: number) => ({ "--delay": `${s.toFixed(2)}s` }) as React.CSSProperties;

export function ConstellationCard({ card }: { card: WikiCard }) {
  const { sky, generation, leaving } = useSky();
  const trail = `trail${useId().replace(/\W/g, "")}-${generation}`;
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
          <defs>
            <linearGradient id={trail} gradientUnits="userSpaceOnUse" {...sky.meteor.gradient}>
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          {sky.dust.map((d) => (
            <circle key={`d${d.x}-${d.y}`} className="cc-dust" cx={d.x} cy={d.y} r={d.r} style={delay(d.delay)} />
          ))}
          {sky.edges.map((e) => (
            <line
              key={`e${e.from}-${e.to}`}
              className="cc-line"
              x1={sky.stars[e.from].x}
              y1={sky.stars[e.from].y}
              x2={sky.stars[e.to].x}
              y2={sky.stars[e.to].y}
              pathLength={1}
              style={delay(e.start)}
            />
          ))}
          {sky.stars.map((s) => (
            <g key={`s${s.x}-${s.y}`} style={{ ...delay(s.lit), "--appear": `${s.appear.toFixed(2)}s` } as never}>
              <circle className="cc-ring" cx={s.x} cy={s.y} r={s.r * 4} />
              <circle className="cc-star" cx={s.x} cy={s.y} r={s.r} />
            </g>
          ))}
          {sky.meteor.show && (
            <line
              className="cc-meteor"
              {...sky.meteor.line}
              stroke={`url(#${trail})`}
              pathLength={1}
              style={delay(sky.meteor.at)}
            />
          )}
        </svg>
      </div>
      <div className="cc-plate">
        <span className="cc-name">{card.title}</span>
      </div>
    </div>
  );
}

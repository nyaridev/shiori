import { motion } from "motion/react";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { WikiCard } from "../../shared/api.ts";
import { api } from "../lib/api.ts";
import { useLive } from "../lib/live.ts";
import { useResource } from "../lib/useResource.ts";
import { CARD_ASPECT, Card } from "./cards/index.ts";
import "./deck.css";
import { Starfield } from "./Starfield.tsx";
import { useDeck } from "./useDeck.ts";

const LAST = "shiori:last";

function startIndex(wikis: WikiCard[], from: string | undefined) {
  let id = from;
  try {
    id ??= sessionStorage.getItem(LAST) ?? undefined;
  } catch {}
  return Math.max(
    0,
    wikis.findIndex((w) => w.id === id),
  );
}

export function Deck() {
  const wikis = useResource("wikis", api.wikis);
  const { reload } = wikis;
  useLive((e) => {
    if (e.type === "wikis") reload();
  });
  const from = (useLocation().state as { from?: string } | null)?.from;

  if (wikis.error) return <DeckMessage>The Shiori server isn't reachable. Is it running?</DeckMessage>;
  if (!wikis.data) return <div className="deck deck-scope" />;
  if (wikis.data.length === 0) {
    return (
      <DeckMessage>
        No wikis yet. Ask an agent to make one: <code>pnpm wiki new &lt;id&gt;</code>
      </DeckMessage>
    );
  }
  return <DeckStage wikis={wikis.data} start={startIndex(wikis.data, from)} />;
}

function DeckMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="deck deck-scope deck-message">
      <p>{children}</p>
    </div>
  );
}

interface Opening {
  card: WikiCard;
  rect: DOMRect;
  radius: string;
}

function DeckStage({ wikis, start }: { wikis: WikiCard[]; start: number }) {
  const navigate = useNavigate();
  const stage = useRef<HTMLDivElement>(null);
  const slotEls = useRef<(HTMLDivElement | null)[]>([]);
  const [opening, setOpening] = useState<Opening | null>(null);
  // The deck keeps its first layout while open; new or removed wikis show up on the next visit.
  const [initial] = useState(() => ({ n: wikis.length, start }));
  const n = Math.min(initial.n, wikis.length);

  const { count, center, dragging, travel } = useDeck({
    stage,
    slots: slotEls,
    n,
    start: initial.start,
    disabled: opening !== null,
    onOpen: (slot) => {
      const el = slotEls.current[slot];
      const card = wikis[slot % n];
      if (!el || !card) return;
      try {
        sessionStorage.setItem(LAST, card.id);
      } catch {}
      const face = el.querySelector(".deck-card-inner > *");
      const radius = face ? getComputedStyle(face).borderTopLeftRadius : "14px";
      setOpening({ card, rect: el.getBoundingClientRect(), radius });
    },
  });

  const slots = useMemo(() => Array.from({ length: count }, (_, i) => wikis[i % n]), [count, wikis, n]);
  const current = wikis[center] ?? wikis[0];

  return (
    <motion.div
      className="deck deck-scope"
      style={{ "--card-aspect": CARD_ASPECT } as CSSProperties}
      data-dragging={dragging || undefined}
      data-opening={opening ? "" : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <Starfield travel={travel} />
      <div className="deck-vignette" />

      <section ref={stage} className="deck-stage" aria-label="Wikis: drag, scroll or use the arrow keys, Enter opens">
        {slots.map((card, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: slots are positions on the loop.
            key={i}
            ref={(el) => {
              slotEls.current[i] = el;
            }}
            className="deck-card"
            data-slot={i}
            data-hidden={opening && i % n === wikis.indexOf(opening.card) ? "" : undefined}
            aria-current={card.id === current.id || undefined}
            style={{ "--accent": card.accent } as CSSProperties}
          >
            <div className="deck-card-inner">
              <Card card={card} />
            </div>
          </div>
        ))}
      </section>

      {opening && (
        <motion.div
          className="deck-expand"
          initial={{
            left: opening.rect.left,
            top: opening.rect.top,
            width: opening.rect.width,
            height: opening.rect.height,
            borderRadius: opening.radius,
          }}
          animate={{ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, borderRadius: 0 }}
          transition={{ duration: 0.62, ease: [0.76, 0, 0.24, 1] }}
        >
          <img src={opening.card.coverUrl} alt="" />
          <motion.div
            className="deck-expand-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.36, duration: 0.34, ease: "easeIn" }}
            onAnimationComplete={() => navigate(`/w/${opening.card.id}`, { state: { fromDeck: true } })}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

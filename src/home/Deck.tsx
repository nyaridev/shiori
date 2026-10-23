import { motion } from "motion/react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { WikiCard } from "../../shared/api.ts";
import { api } from "../lib/api.ts";
import { useLive } from "../lib/live.ts";
import { useResource } from "../lib/useResource.ts";
import { CARD_ASPECT, Card } from "./cards/index.ts";
import "./deck.css";
import { bestMatch, matchScore } from "./match.ts";
import { openCard, warmOpening } from "./opening/openCard.ts";
import { Search } from "./Search.tsx";
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

  if (wikis.error) return <DeckOffline />;
  if (!wikis.data) return <div className="deck deck-scope" />;
  if (wikis.data.length === 0) return <NoWikis />;
  return <DeckStage wikis={wikis.data} start={startIndex(wikis.data, from)} />;
}

export const DeckOffline = () => <DeckMessage>The Shiori server isn't reachable. Is it running?</DeckMessage>;

export const NoWikis = () => (
  <DeckMessage>
    No wikis yet. Ask an agent to make one: <code>pnpm shiori new &lt;id&gt;</code>
  </DeckMessage>
);

function DeckMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="deck deck-scope deck-message">
      <p>{children}</p>
    </div>
  );
}

function DeckStage({ wikis, start }: { wikis: WikiCard[]; start: number }) {
  const navigate = useNavigate();
  const stage = useRef<HTMLDivElement>(null);
  const slotEls = useRef<(HTMLDivElement | null)[]>([]);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  // The deck keeps its first layout while open; new or removed wikis show up on the next visit.
  const [initial] = useState(() => ({ n: wikis.length, start }));
  const n = Math.min(initial.n, wikis.length);

  const [query, setQuery] = useState("");
  useEffect(() => {
    document.title = "Shiori";
    // Compile the opening's shader while the deck sits idle.
    const warm = setTimeout(warmOpening, 400);
    return () => clearTimeout(warm);
  }, []);

  const { count, center, dragging, travel, controls } = useDeck({
    stage,
    slots: slotEls,
    n,
    start: initial.start,
    disabled: opening,
    onOpen: (slot) => {
      const card = wikis[slot % n];
      if (!card || openingRef.current) return;
      openingRef.current = true;
      setOpening(true);
      try {
        sessionStorage.setItem(LAST, card.id);
      } catch {}
      const transition = openCard({ slots: slotEls.current, slot, wikiId: card.id, accent: card.accent });
      void transition.ready.then(() => {
        navigate(`/w/${card.id}`, { state: { fromDeck: true } });
        // Let the wiki paint under the layer, then fade the layer away.
        requestAnimationFrame(() => requestAnimationFrame(transition.reveal));
      });
    },
  });

  const slots = useMemo(() => Array.from({ length: count }, (_, i) => wikis[i % n]), [count, wikis, n]);

  // Searching spins the deck to the best match.
  const best = useMemo(() => bestMatch(wikis.slice(0, n), query), [wikis, n, query]);
  useEffect(() => {
    if (best >= 0) controls.current.goTo(best);
  }, [best, controls]);
  const current = wikis[center] ?? wikis[0];

  return (
    <motion.div
      className="deck deck-scope"
      style={{ "--card-aspect": CARD_ASPECT } as CSSProperties}
      data-dragging={dragging || undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <Starfield travel={travel} />
      <Search
        query={query}
        onChange={setQuery}
        found={best >= 0}
        onSubmit={() => best >= 0 && controls.current.openCenter()}
        disabled={opening}
      />
      <div className="deck-vignette" />
      {/* For screen readers: which wiki is in the middle as the deck turns, and every wiki as a link. The cards
          themselves are pictures of these. */}
      <p className="sh-sr-only" aria-live="polite">
        {current && `${current.title}, ${(center % n) + 1} of ${n}. Enter opens it.`}
      </p>
      <nav className="sh-sr-only" aria-label="Wikis">
        <ul>
          {wikis.slice(0, n).map((w) => (
            <li key={w.id}>
              <Link to={`/w/${w.id}`} tabIndex={-1}>
                {w.title}
                {w.tagline && `: ${w.tagline}`}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section ref={stage} className="deck-stage" aria-label="Wikis: drag, scroll or use the arrow keys, Enter opens">
        {slots.map((card, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: slots are positions on the loop.
            key={i}
            ref={(el) => {
              slotEls.current[i] = el;
            }}
            className="deck-card"
            aria-hidden="true"
            data-slot={i}
            data-dim={(query.trim() && matchScore(card, query) === 0) || undefined}
            aria-current={card.id === current.id || undefined}
            style={{ "--accent": card.accent } as CSSProperties}
          >
            <div className="deck-card-inner">
              <Card card={card} />
            </div>
          </div>
        ))}
      </section>
    </motion.div>
  );
}

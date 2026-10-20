// Deck card styles: the Character family (after Genshin's character cards). Each variant is one component + one
// CSS file over the shared character.css. The deck sets --focus (0–1, how centered the card is), --d (signed
// distance from the center, in cards) and --accent (the wiki's accent) on every card.
// In dev, a bar on top of the deck switches between them (keys 1–6); the choice is remembered per browser.
import { type ComponentType, useCallback, useState } from "react";
import { Classic } from "./Classic.tsx";
import { Constellation } from "./Constellation.tsx";
import { Glass } from "./Glass.tsx";
import { Level } from "./Level.tsx";
import { Party } from "./Party.tsx";
import type { CardProps } from "./shared.tsx";
import { WishSplash } from "./WishSplash.tsx";

export interface CardStyle {
  id: string;
  label: string;
  /** Width ÷ height. */
  aspect: number;
  Card: ComponentType<CardProps>;
}

export const CARD_STYLES: CardStyle[] = [
  { id: "classic", label: "Classic", aspect: 0.74, Card: Classic },
  { id: "level", label: "Level", aspect: 0.72, Card: Level },
  { id: "constellation", label: "Constellation", aspect: 0.72, Card: Constellation },
  { id: "wish", label: "Wish", aspect: 0.68, Card: WishSplash },
  { id: "party", label: "Party", aspect: 0.72, Card: Party },
  { id: "glass", label: "Glass", aspect: 0.72, Card: Glass },
];

export const DEFAULT_STYLE = "classic";
const KEY = "shiori:card-style";

const find = (id: string | null) => CARD_STYLES.find((s) => s.id === id);

export function useCardStyle(): [CardStyle, (id: string) => void] {
  const [id, setId] = useState(() => {
    try {
      return find(localStorage.getItem(KEY))?.id ?? DEFAULT_STYLE;
    } catch {
      return DEFAULT_STYLE;
    }
  });
  const choose = useCallback((next: string) => {
    setId(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }, []);
  return [find(id) ?? CARD_STYLES[0], choose];
}

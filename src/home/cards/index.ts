// Deck card styles. Each style is one component + one CSS file; the deck sets --focus (0–1, how centered the card
// is), --d (signed distance from the center, in cards) and --accent (the wiki's accent) on every card.
// In dev, a bar on top of the deck switches between them (keys 1–6); the choice is remembered per browser.
import { type ComponentType, useCallback, useState } from "react";
import { GenshinCharacter } from "./GenshinCharacter.tsx";
import { GenshinPaper } from "./GenshinPaper.tsx";
import { GenshinWish } from "./GenshinWish.tsx";
import { HoloCard } from "./HoloCard.tsx";
import { UmeFrame } from "./UmeFrame.tsx";
import { UmeSlot } from "./UmeSlot.tsx";
import "./cards.css";
import type { CardProps } from "./shared.ts";

export interface CardStyle {
  id: string;
  label: string;
  /** Width ÷ height. */
  aspect: number;
  Card: ComponentType<CardProps>;
}

export const CARD_STYLES: CardStyle[] = [
  { id: "ume-frame", label: "Ume frame", aspect: 0.66, Card: UmeFrame },
  { id: "ume-slot", label: "Ume slot", aspect: 0.8, Card: UmeSlot },
  { id: "genshin-character", label: "Character", aspect: 0.74, Card: GenshinCharacter },
  { id: "genshin-wish", label: "Wish banner", aspect: 0.6, Card: GenshinWish },
  { id: "genshin-paper", label: "Parchment", aspect: 0.68, Card: GenshinPaper },
  { id: "holo", label: "Holo", aspect: 0.716, Card: HoloCard },
];

export const DEFAULT_STYLE = "ume-frame";
const KEY = "loredeck:card-style";

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

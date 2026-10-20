import type { WikiCard } from "../../../shared/api.ts";

export interface CardProps {
  card: WikiCard;
}

export const initialOf = (title: string) => [...title][0]?.toUpperCase() ?? "?";

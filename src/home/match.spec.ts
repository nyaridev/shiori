import { describe, expect, it } from "vitest";
import type { WikiCard } from "../../shared/api.ts";
import { bestMatch, matchScore } from "./match.ts";

const card = (id: string, title: string, tagline = ""): WikiCard => ({
  id,
  title,
  tagline,
  coverUrl: "",
  accent: "#ffffff",
  source: "local",
  pages: 1,
});

const cards = [
  card("ember", "Ember Hollow", "A cozy dungeon crawler"),
  card("tide", "Tidebound", "Island-hopping roguelike"),
  card("moss", "Mosslight", "A slow forest farming sim"),
];

describe("deck search", () => {
  it("prefers title starts, then word starts, then anything else", () => {
    expect(bestMatch(cards, "tide")).toBe(1);
    expect(bestMatch(cards, "hollow")).toBe(0);
    expect(bestMatch(cards, "light")).toBe(2);
    expect(bestMatch(cards, "farming")).toBe(2);
  });

  it("matches letters in order, ignoring case and accents", () => {
    expect(bestMatch(cards, "EBH")).toBe(0);
    expect(bestMatch(cards, "emho")).toBe(0);
    expect(matchScore(card("cafe", "Café Story"), "cafe")).toBeGreaterThan(0);
  });

  it("finds nothing for empty or unknown queries", () => {
    expect(bestMatch(cards, "   ")).toBe(-1);
    expect(bestMatch(cards, "zzz")).toBe(-1);
  });
});

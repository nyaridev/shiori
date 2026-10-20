// Deck search: how well a wiki matches what the user typed. 0 means no match.
import type { WikiCard } from "../../shared/api.ts";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Letters of `q` appear in `text` in order (e.g. "ebh" in "ember hollow"). */
function subsequence(text: string, q: string) {
  let i = 0;
  for (const ch of text) if (ch === q[i]) i++;
  return i === q.length;
}

export function matchScore(card: WikiCard, query: string): number {
  const q = norm(query.trim());
  if (!q) return 0;
  const title = norm(card.title);
  const words = title.split(/\s+/);
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (words.some((w) => w.startsWith(q))) return 70;
  if (title.includes(q)) return 60;
  if (norm(card.id).includes(q)) return 50;
  if (norm(card.tagline).includes(q)) return 30;
  if (subsequence(title, q)) return 20;
  return 0;
}

/** Index of the best match in `cards`, or -1. Ties go to the earlier card. */
export function bestMatch(cards: WikiCard[], query: string): number {
  let best = -1;
  let top = 0;
  cards.forEach((c, i) => {
    const score = matchScore(c, query);
    if (score > top) {
      top = score;
      best = i;
    }
  });
  return best;
}

// The palettes a new wiki starts from (`pnpm shiori new`, the dev preview): `mist` unless another is asked for. Each
// is a dark page, grey or tinted toward one hue, with three accents that contrast with it and with each other. They
// fill the template's `theme.json`; after that, the wiki's theme is its own.
import type { ThemeColors } from "./theme.ts";

export type Palette = Pick<
  ThemeColors,
  "bg" | "surface" | "raised" | "border" | "muted" | "accent" | "accent2" | "accent3"
>;

export const NEW_WIKI_PALETTES = {
  /** The default: a cool grey page with soft blue, peach and mint. */
  mist: {
    bg: "#101419",
    surface: "#161b20",
    raised: "#1d2228",
    border: "#2e343a",
    muted: "#a2a8af",
    accent: "#a8ceff",
    accent2: "#fbbb87",
    accent3: "#9bdda8",
  },
  nebula: {
    bg: "#100e1d",
    surface: "#181527",
    raised: "#211e33",
    border: "#35314b",
    muted: "#9e9bb3",
    accent: "#7cc4ff",
    accent2: "#ff8f5a",
    accent3: "#f7d046",
  },
  reef: {
    bg: "#03121c",
    surface: "#061b26",
    raised: "#0b2532",
    border: "#1c3949",
    muted: "#8aa2b1",
    accent: "#3fe0c5",
    accent2: "#ff6b8b",
    accent3: "#ffc857",
  },
  ember: {
    bg: "#1c0b07",
    surface: "#26120d",
    raised: "#321a14",
    border: "#4a2d25",
    muted: "#b39790",
    accent: "#ffb347",
    accent2: "#4cc9f0",
    accent3: "#ff5d73",
  },
  grove: {
    bg: "#05140b",
    surface: "#0a1d11",
    raised: "#102719",
    border: "#223c2b",
    muted: "#8ea595",
    accent: "#9be15d",
    accent2: "#ffd23f",
    accent3: "#c38bff",
  },
  orchid: {
    bg: "#180b17",
    surface: "#211220",
    raised: "#2c1a2b",
    border: "#432d40",
    muted: "#ac97a9",
    accent: "#ff7eb6",
    accent2: "#6ee7b7",
    accent3: "#ffd166",
  },
  frost: {
    bg: "#07111d",
    surface: "#0d1928",
    raised: "#142234",
    border: "#25364c",
    muted: "#90a0b4",
    accent: "#8ab4ff",
    accent2: "#ff9e64",
    accent3: "#9ece6a",
  },
  lagoon: {
    bg: "#001416",
    surface: "#011d1f",
    raised: "#032729",
    border: "#133c3e",
    muted: "#86a5a7",
    accent: "#5eead4",
    accent2: "#f472b6",
    accent3: "#facc15",
  },
  dusk: {
    bg: "#0d0f1e",
    surface: "#141728",
    raised: "#1c2035",
    border: "#2e344d",
    muted: "#989db5",
    accent: "#b69cff",
    accent2: "#ff8a65",
    accent3: "#5ce1e6",
  },
} as const satisfies Record<string, Palette>;

export type PaletteName = keyof typeof NEW_WIKI_PALETTES;
export const PALETTE_NAMES = Object.keys(NEW_WIKI_PALETTES) as PaletteName[];
export const DEFAULT_PALETTE: PaletteName = "mist";

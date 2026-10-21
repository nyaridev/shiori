// A wiki's `theme.json` only nudges the app's design tokens: colors, corner shape, borders, shadows and fonts.
// Layout and behavior never change. Every value is a preset or a hex color, so a theme can't inject CSS.
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "use a #rrggbb color");

export const FONTS = {
  sans: '"Inter Variable", system-ui, sans-serif',
  grotesk: '"Space Grotesk Variable", system-ui, sans-serif',
  serif: '"Fraunces Variable", Georgia, serif',
  pixel: '"Pixelify Sans Variable", system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  system: "system-ui, sans-serif",
} as const;
export type FontKey = keyof typeof FONTS;
const fontKey = z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]);

const colorsSchema = z.strictObject({
  bg: hex,
  surface: hex,
  raised: hex,
  border: hex,
  text: hex,
  muted: hex,
  accent: hex,
  accentText: hex,
});
export type ThemeColors = z.infer<typeof colorsSchema>;

export const themeSchema = z.strictObject({
  mode: z.enum(["dark", "light"]).default("dark"),
  colors: colorsSchema.partial().default({}),
  radius: z.enum(["none", "small", "medium", "large"]).default("medium"),
  border: z.enum(["thin", "thick"]).default("thin"),
  shadow: z.enum(["none", "soft", "hard"]).default("soft"),
  font: z.strictObject({ body: fontKey, heading: fontKey }).partial().default({}),
});
export type Theme = z.infer<typeof themeSchema>;

export const DEFAULT_THEME: Theme = themeSchema.parse({});

export const PALETTES: Record<Theme["mode"], ThemeColors> = {
  dark: {
    bg: "#0f1012",
    surface: "#16171a",
    raised: "#1e2024",
    border: "#2b2e33",
    text: "#e9e7e2",
    muted: "#8e9198",
    accent: "#e8b86d",
    accentText: "#1c1407",
  },
  light: {
    bg: "#f5f3ee",
    surface: "#fbfaf7",
    raised: "#ffffff",
    border: "#dedad1",
    text: "#1f1d1a",
    muted: "#6f6a62",
    accent: "#b5651d",
    accentText: "#fffaf3",
  },
};

const RADII = {
  none: ["0px", "0px", "0px"],
  small: ["3px", "5px", "8px"],
  medium: ["6px", "9px", "14px"],
  large: ["10px", "16px", "24px"],
} as const;

const SHADOWS = {
  none: ["none", "none"],
  soft: ["0 1px 2px rgb(0 0 0 / 0.18)", "0 1px 2px rgb(0 0 0 / 0.16), 0 12px 32px -8px rgb(0 0 0 / 0.35)"],
  hard: [
    "2px 2px 0 0 color-mix(in oklab, var(--text) 80%, transparent)",
    "4px 4px 0 0 color-mix(in oklab, var(--text) 80%, transparent)",
  ],
} as const;

const CSS_NAMES: Record<keyof ThemeColors, string> = {
  bg: "--bg",
  surface: "--surface",
  raised: "--raised",
  border: "--border",
  text: "--text",
  muted: "--muted",
  accent: "--accent",
  accentText: "--accent-text",
};

export type Mode = Theme["mode"];

const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
/** `a` moved `t` (0–1) of the way to `b`. */
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [channels(a), channels(b)];
  return toHex(x.map((c, i) => c + (y[i] - c) * t));
};
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A theme's colors, in its own mode or in the one the viewer picked (the header's day/night switch). In the other
 * mode the wiki keeps its accent, shapes and fonts on that mode's palette: its own backgrounds and text were chosen
 * for the other mode. The accent is pulled toward the text until it stands out from the background again.
 */
export function themeColors(theme: Theme, mode: Mode = theme.mode): ThemeColors {
  if (mode === theme.mode) return { ...PALETTES[mode], ...theme.colors };
  const base = PALETTES[mode];
  const own = theme.colors.accent;
  if (!own) return base;
  let accent = own;
  for (let t = 0.1; contrast(accent, base.bg) < 3 && t <= 1; t += 0.1) accent = mix(own, base.text, t);
  // Text on the accent: the wiki's own while it still reads, else the palette's, else black or white.
  const options = [theme.colors.accentText, base.accentText, "#000000", "#ffffff"].filter((c): c is string => !!c);
  const accentText =
    options.find((c) => contrast(c, accent) >= 4.5) ??
    options.reduce((a, b) => (contrast(b, accent) > contrast(a, accent) ? b : a));
  return { ...base, accent, accentText };
}

/**
 * Every token a theme controls, as CSS custom properties. Derived tokens (soft accents…) live in tokens.css. `mode`
 * is the viewer's choice of day or night, when they made one.
 */
export function themeVars(theme: Theme, mode: Mode = theme.mode): Record<string, string> {
  const colors = themeColors(theme, mode);
  const vars: Record<string, string> = { "color-scheme": mode };
  for (const key of Object.keys(CSS_NAMES) as (keyof ThemeColors)[]) vars[CSS_NAMES[key]] = colors[key];
  const [sm, md, lg] = RADII[theme.radius];
  vars["--r-sm"] = sm;
  vars["--r-md"] = md;
  vars["--r-lg"] = lg;
  vars["--bw"] = theme.border === "thick" ? "2px" : "1px";
  const [s1, s2] = SHADOWS[theme.shadow];
  vars["--shadow-1"] = s1;
  vars["--shadow-2"] = s2;
  vars["--font-body"] = FONTS[theme.font.body ?? "sans"];
  vars["--font-heading"] = FONTS[theme.font.heading ?? theme.font.body ?? "sans"];
  return vars;
}

/** The accent of a theme, for things drawn outside it (the deck card glow). */
export function themeAccent(theme: Theme): string {
  // The deck is always dark, so it shows the wiki's own accent.
  return theme.colors.accent ?? PALETTES[theme.mode].accent;
}

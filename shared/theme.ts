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

/** Every token a theme controls, as CSS custom properties. Derived tokens (soft accents…) live in tokens.css. */
export function themeVars(theme: Theme): Record<string, string> {
  const colors = { ...PALETTES[theme.mode], ...theme.colors };
  const vars: Record<string, string> = { "color-scheme": theme.mode };
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
  return theme.colors.accent ?? PALETTES[theme.mode].accent;
}

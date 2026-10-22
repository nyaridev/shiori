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
    surface: "#17181c",
    raised: "#212328",
    border: "#2f3238",
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
    accent: "#a35915",
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
const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const toGamma = (l: number) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);

/** OKLab: lightness, then the two color axes. Changing only the lightness keeps the hue and how vivid it is. */
function toOklab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, a, b]: number[]): number[] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGamma);
}
/** `hex` at OKLab lightness `L`, same hue; it gives up vividness only where the screen can't show it. */
function atLightness(hex: string, L: number): string {
  const [, a, b] = toOklab(hex);
  for (let k = 1; k > 0; k -= 0.05) {
    const rgb = fromOklab([L, a * k, b * k]);
    if (rgb.every((c) => c > -0.5 && c < 255.5)) return toHex(rgb.map((c) => Math.min(255, Math.max(0, c))));
  }
  return toHex(fromOklab([L, 0, 0]).map((c) => Math.min(255, Math.max(0, c))));
}
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

/** `color` made lighter or darker, toward the lightness of `text`, until it has `min` contrast on each of `backgrounds`. */
function readable(color: string, text: string, backgrounds: string[], min: number): string {
  const worst = (c: string) => Math.min(...backgrounds.map((b) => contrast(c, b)));
  if (worst(color) >= min) return color;
  const [from] = toOklab(color);
  const [to] = toOklab(text);
  for (let t = 0.02; t < 1; t += 0.02) {
    const out = atLightness(color, from + (to - from) * t);
    if (worst(out) >= min) return out;
  }
  return text;
}

/** The contrast that text in a color aims for: WCAG AA (4.5) with room for tinted backgrounds. */
export const INK = 5;

/**
 * The accent as a fill (buttons, the open page, checked boxes) and the text on it. A mid-tone fill reads poorly under
 * dark text and light text alike, even where the ratio passes, so the text follows the page: light text on a light
 * page's buttons, dark on a dark page's. The theme's own text color is kept while it reads; otherwise the palette's
 * is used, and the accent is deepened (light pages) or brightened (dark pages) until that text reads on it.
 */
function onAccent(
  accent: string,
  mode: Mode,
  text: string,
  ownText?: string,
): Pick<ThemeColors, "accent" | "accentText"> {
  if (ownText && contrast(ownText, accent) >= INK) return { accent, accentText: ownText };
  const accentText = PALETTES[mode].accentText;
  return { accent: readable(accent, text, [accentText], INK), accentText };
}

/**
 * A theme's colors, in its own mode or in the one the viewer picked (the header's day/night switch). In the other
 * mode the wiki keeps its accent, shapes and fonts on that mode's palette: its own backgrounds and text were chosen
 * for the other mode, and the accent is pulled toward the text until it stands out from the background again. In
 * both, the accent is then fitted to the text on it (`onAccent`).
 */
export function themeColors(theme: Theme, mode: Mode = theme.mode): ThemeColors {
  const base = PALETTES[mode];
  if (mode === theme.mode) {
    const colors = { ...base, ...theme.colors };
    return { ...colors, ...onAccent(colors.accent, mode, colors.text, theme.colors.accentText) };
  }
  const own = theme.colors.accent;
  if (!own) return base;
  return { ...base, ...onAccent(readable(own, base.text, [base.bg], 3), mode, base.text) };
}

/**
 * The status colors (done, warning, problem) each mode starts from. Like the accent's ink, they're pulled toward the
 * theme's text until they read as text on its backgrounds.
 */
const TONES: Record<Mode, Record<"good" | "warn" | "bad", string>> = {
  dark: { good: "#6fbf8e", warn: "#e0b04f", bad: "#e0705f" },
  light: { good: "#2e7d4f", warn: "#94600c", bad: "#c03b2b" },
};

/**
 * The same tones as small fills (the sidebar's dots for what waits on a page). They're never text, so on a light page
 * they stay bright instead of taking the text tones' dark ink.
 */
const DOTS: Record<Mode, Record<"good" | "warn", string>> = {
  dark: { good: TONES.dark.good, warn: TONES.dark.warn },
  light: { good: "#4ccb7d", warn: "#f6ae2d" },
};

/**
 * Every token a theme controls, as CSS custom properties. Derived tokens (soft accents…) live in tokens.css. `mode`
 * is the viewer's choice of day or night, when they made one.
 */
export function themeVars(theme: Theme, mode: Mode = theme.mode): Record<string, string> {
  const colors = themeColors(theme, mode);
  const vars: Record<string, string> = { "color-scheme": mode };
  for (const key of Object.keys(CSS_NAMES) as (keyof ThemeColors)[]) vars[CSS_NAMES[key]] = colors[key];
  // Colors used as text (links, the open page, statuses) must read on every background a page uses: 4.5:1, aimed a
  // little higher so they still do on the tinted panels, badges and cards. The accent itself only has to stand out
  // (3:1), since it's also a fill.
  const backgrounds = [colors.bg, colors.surface, colors.raised];
  vars["--accent-ink"] = readable(colors.accent, colors.text, backgrounds, INK);
  for (const [tone, color] of Object.entries(TONES[mode]))
    vars[`--tone-${tone}`] = readable(color, colors.text, backgrounds, INK);
  for (const [tone, color] of Object.entries(DOTS[mode])) vars[`--dot-${tone}`] = color;
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

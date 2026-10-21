import { describe, expect, it } from "vitest";
import { contrast, DEFAULT_THEME, PALETTES, themeColors, themeSchema, themeVars } from "./theme.ts";

describe("themes", () => {
  it("fills every token from the palette and presets", () => {
    const vars = themeVars(DEFAULT_THEME);
    expect(vars["--bg"]).toBe(PALETTES.dark.bg);
    expect(vars["--r-md"]).toBe("9px");
    expect(vars["--font-body"]).toContain("Inter");
  });

  it("applies overrides on top of the mode's palette", () => {
    const theme = themeSchema.parse({ mode: "light", colors: { accent: "#123456" }, radius: "none", border: "thick" });
    const vars = themeVars(theme);
    expect(vars["--accent"]).toBe("#123456");
    expect(vars["--bg"]).toBe(PALETTES.light.bg);
    expect(vars["--r-lg"]).toBe("0px");
    expect(vars["--bw"]).toBe("2px");
  });

  it("uses the body font for headings unless set", () => {
    const vars = themeVars(themeSchema.parse({ font: { body: "serif" } }));
    expect(vars["--font-heading"]).toBe(vars["--font-body"]);
  });

  it("rejects anything that isn't a preset or a hex color", () => {
    expect(themeSchema.safeParse({ colors: { accent: "red; background: url(x)" } }).success).toBe(false);
    expect(themeSchema.safeParse({ radius: "huge" }).success).toBe(false);
    expect(themeSchema.safeParse({ layout: "wide" }).success).toBe(false);
  });
});

describe("the viewer's day/night switch", () => {
  const night = themeSchema.parse({
    mode: "dark",
    colors: { bg: "#000814", text: "#f0f0ff", accent: "#ffd166", accentText: "#201000" },
    radius: "large",
    font: { body: "serif" },
  });

  it("changes nothing in the theme's own mode", () => {
    expect(themeVars(night, "dark")).toEqual(themeVars(night));
  });

  it("swaps in the other palette but keeps the accent, shapes and fonts", () => {
    const vars = themeVars(night, "light");
    expect(vars["color-scheme"]).toBe("light");
    expect(vars["--bg"]).toBe(PALETTES.light.bg);
    expect(vars["--text"]).toBe(PALETTES.light.text);
    expect(vars["--r-lg"]).toBe("24px");
    expect(vars["--font-body"]).toContain("Fraunces");
  });

  it("darkens a pale accent until it reads on a light page, with text that reads on it", () => {
    const { accent, accentText } = themeColors(night, "light");
    expect(accent).not.toBe("#ffd166");
    expect(contrast(accent, PALETTES.light.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(accentText, accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps an accent that already reads, and the palette's accent when the theme has none", () => {
    const blue = themeSchema.parse({ colors: { accent: "#1d4ed8" } });
    expect(themeColors(blue, "light").accent).toBe("#1d4ed8");
    expect(themeColors(DEFAULT_THEME, "light")).toEqual(PALETTES.light);
  });
});

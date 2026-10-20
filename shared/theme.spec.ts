import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, PALETTES, themeSchema, themeVars } from "./theme.ts";

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

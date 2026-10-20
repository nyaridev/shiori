import { useLayoutEffect } from "react";
import { type Theme, themeVars } from "../../shared/theme.ts";

/**
 * Applies a wiki theme to <html> while mounted. It goes on the root, not a wrapper, so popovers and dialogs (which
 * render in a portal on <body>) get the theme too.
 */
export function useTheme(theme: Theme | undefined) {
  useLayoutEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const vars = themeVars(theme);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [theme]);
}

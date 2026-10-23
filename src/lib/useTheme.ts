import { useLayoutEffect } from "react";
import { type Theme, themeVars } from "../../shared/theme.ts";
import { useViewerMode } from "./viewerMode.ts";

/**
 * Applies a wiki theme to <html> while mounted, in the day or night the viewer picked, else the system's. It goes on
 * the root, not a wrapper, so popovers and dialogs (which render in a portal on <body>) get the theme too.
 */
export function useTheme(theme: Theme | undefined) {
  const mode = useViewerMode();
  useLayoutEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const vars = themeVars(theme, mode);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [theme, mode]);
}

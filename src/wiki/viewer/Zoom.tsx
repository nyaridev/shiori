import type { ReactNode } from "react";
import { useViewer } from "./ViewerContext.ts";

/** Makes a picture open the image viewer. Without a viewer (outside a wiki) it stays a plain picture. */
export function Zoom({ src, label, children }: { src?: string; label?: string; children: ReactNode }) {
  const viewer = useViewer();
  if (!viewer || !src) return <>{children}</>;
  return (
    <button
      type="button"
      className="sh-zoom"
      aria-label={label ? `Open “${label}”` : "Open the picture"}
      onClick={() => viewer.open(src)}
    >
      {children}
    </button>
  );
}

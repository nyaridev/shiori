// A page's icon: one of Shiori's drawn icons by name (src/icons/), a picture the wiki drew for itself (the server
// sends its URL), or an emoji. Sized by the text around it.
import { ICONS } from "../icons/index.ts";
import { picture } from "../lib/base.ts";

const isPicture = (icon: string) => icon.startsWith("/") || /^https?:\/\//.test(icon);

export function PageIcon({ icon, fallback, className }: { icon?: string; fallback?: string; className?: string }) {
  const shown = icon ?? fallback;
  if (!shown) return null;
  const src = ICONS[shown] ?? (isPicture(shown) ? picture(shown, 160) : null);
  if (src) return <img src={src} alt="" aria-hidden="true" className={`sh-icon-img ${className ?? ""}`} />;
  return (
    <span aria-hidden="true" className={className}>
      {shown}
    </span>
  );
}

// A page's icon: an emoji, or a picture drawn for the project (`icon: /assets/icons/sword.svg`), which the server
// sends as its URL. Sized by the text around it.
import { picture } from "../lib/base.ts";

const isPicture = (icon: string) => icon.startsWith("/api/") || /^https?:\/\//.test(icon);

export function PageIcon({ icon, fallback, className }: { icon?: string; fallback?: string; className?: string }) {
  const shown = icon ?? fallback;
  if (!shown) return null;
  if (isPicture(shown)) {
    return <img src={picture(shown, 160)} alt="" aria-hidden="true" className={`sh-icon-img ${className ?? ""}`} />;
  }
  return (
    <span aria-hidden="true" className={className}>
      {shown}
    </span>
  );
}

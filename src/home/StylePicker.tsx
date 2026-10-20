// Dev only (pnpm dev): a bar on top of the deck to compare card styles. Keys 1–6 switch too.
import { useEffect } from "react";
import { CARD_STYLES } from "./cards/index.ts";

export function StylePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const style = CARD_STYLES[Number(e.key) - 1];
      if (style) onChange(style.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  return (
    <nav className="deck-dev" aria-label="Card style (dev)">
      <span className="deck-dev-tag">Dev</span>
      {CARD_STYLES.map((s, i) => (
        <button
          key={s.id}
          type="button"
          className="deck-dev-item"
          data-active={s.id === value || undefined}
          onClick={() => onChange(s.id)}
        >
          <kbd>{i + 1}</kbd>
          {s.label}
        </button>
      ))}
    </nav>
  );
}

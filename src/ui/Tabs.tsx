import { Tabs as R } from "radix-ui";
import type { ReactNode } from "react";
import { Glider } from "./Glider.tsx";

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
  /** A tab that stands out in a color, its panel tinted to match. */
  tone?: "accent" | "good" | "warn" | "bad";
}

/** Inactive panels stay in the DOM (hidden), so comment anchors inside them still resolve. */
export function Tabs({ items, defaultValue }: { items: TabItem[]; defaultValue?: string }) {
  return (
    <R.Root className="sh-tabs" defaultValue={defaultValue ?? items[0]?.value}>
      <R.List className="sh-tabs-list" data-noquote="">
        {items.map((t) => (
          <R.Trigger key={t.value} value={t.value} className="sh-tabs-trigger" data-tone={t.tone}>
            {t.label}
          </R.Trigger>
        ))}
      </R.List>
      {items.map((t) => (
        <R.Content key={t.value} value={t.value} className="sh-tabs-panel" data-tone={t.tone} forceMount>
          {t.content}
        </R.Content>
      ))}
    </R.Root>
  );
}

/** Segmented control: tabs without panels. The picked one's background slides over to it. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <R.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <R.List className="sh-segmented sh-glide-host">
        <Glider follow="current" select='.sh-segmented-item[data-state="active"]' className="sh-segmented-thumb" />
        {options.map((o) => (
          <R.Trigger key={o.value} value={o.value} className="sh-segmented-item">
            {o.label}
          </R.Trigger>
        ))}
      </R.List>
    </R.Root>
  );
}

import { Select as R } from "radix-ui";
import { Icon } from "./Icon.tsx";

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  label,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  placeholder?: string;
  label?: string;
}) {
  return (
    <R.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <R.Trigger className="sh-field sh-select" aria-label={label}>
        <R.Value placeholder={placeholder} />
        <R.Icon className="sh-select-icon">
          <Icon name="chevronDown" size={16} />
        </R.Icon>
      </R.Trigger>
      <R.Portal>
        <R.Content className="sh-menu sh-surface" position="popper" sideOffset={6} collisionPadding={12}>
          <R.Viewport>
            {options.map((o) => (
              <R.Item key={o.value} value={o.value} className="sh-menu-item">
                <R.ItemText>{o.label}</R.ItemText>
                <R.ItemIndicator className="sh-menu-check">
                  <Icon name="check" size={15} />
                </R.ItemIndicator>
              </R.Item>
            ))}
          </R.Viewport>
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}

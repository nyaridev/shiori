import { Checkbox as RCheckbox, Switch as RSwitch } from "radix-ui";
import { type ReactNode, useId } from "react";

/**
 * The tick in a checkbox: one bold stroke with round ends and joins, like Shiori's drawn icons, in the box's text
 * color. Sized by the box (1em by default).
 */
export function CheckMark({ size = "1em" }: { size?: number | string }) {
  return (
    <svg className="sh-checkmark" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path d="M3.4 8.6 6.6 11.6 12.6 4.6" />
    </svg>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}

export function Switch({ checked, onChange, disabled, children }: ToggleProps) {
  const id = useId();
  return (
    <span className="sh-toggle-row">
      <RSwitch.Root id={id} className="sh-switch" checked={checked} onCheckedChange={onChange} disabled={disabled}>
        <RSwitch.Thumb className="sh-switch-thumb" />
      </RSwitch.Root>
      {children && <label htmlFor={id}>{children}</label>}
    </span>
  );
}

export function Checkbox({ checked, onChange, disabled, children }: ToggleProps) {
  const id = useId();
  return (
    <span className="sh-toggle-row">
      <RCheckbox.Root
        id={id}
        className="sh-checkbox"
        checked={checked}
        onCheckedChange={(v) => onChange?.(v === true)}
        disabled={disabled}
      >
        <RCheckbox.Indicator>
          <CheckMark size={14} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {children && <label htmlFor={id}>{children}</label>}
    </span>
  );
}

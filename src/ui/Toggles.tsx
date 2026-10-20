import { Checkbox as RCheckbox, Switch as RSwitch } from "radix-ui";
import { type ReactNode, useId } from "react";
import { Icon } from "./Icon.tsx";

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
          <Icon name="check" size={13} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {children && <label htmlFor={id}>{children}</label>}
    </span>
  );
}

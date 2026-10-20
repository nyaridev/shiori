import { DropdownMenu as R } from "radix-ui";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";

export const Menu = R.Root;
export const MenuTrigger = R.Trigger;

export function MenuContent({ children }: { children: ReactNode }) {
  return (
    <R.Portal>
      <R.Content className="ld-menu ld-surface" sideOffset={6} align="start" collisionPadding={12}>
        {children}
      </R.Content>
    </R.Portal>
  );
}

export function MenuItem({
  icon,
  children,
  danger,
  onSelect,
}: {
  icon?: IconName;
  children: ReactNode;
  danger?: boolean;
  onSelect?: () => void;
}) {
  return (
    <R.Item className="ld-menu-item" data-danger={danger || undefined} onSelect={onSelect}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </R.Item>
  );
}

export const MenuSeparator = () => <R.Separator className="ld-separator" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <R.Label className="ld-menu-label">{children}</R.Label>
);

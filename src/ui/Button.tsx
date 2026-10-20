import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";

export type ButtonVariant = "solid" | "soft" | "ghost" | "outline";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  children?: ReactNode;
}

export function Button({ variant = "soft", size = "md", icon, children, className, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cx("sh-button", className)} data-variant={variant} data-size={size} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function IconButton({ icon, label, variant = "ghost", size = "md", className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={cx("sh-button sh-icon-button", className)}
      data-variant={variant}
      data-size={size}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" ? 15 : 18} />
    </button>
  );
}

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

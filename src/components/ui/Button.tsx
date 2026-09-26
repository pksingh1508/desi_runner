import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "saffron" | "marigold" | "rani" | "peacock" | "indigo" | "ghost";
type Size = "xl" | "lg" | "md" | "sm";

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Periodic light sweep — reserve for the primary call to action. */
  shine?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

/** Extruded 3D game button: glossy face, layered depth, press-down on :active. */
export function GameButton({
  variant = "saffron",
  size = "md",
  shine = false,
  block = false,
  icon,
  className,
  children,
  type = "button",
  ...rest
}: GameButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "btn",
        `btn--${variant}`,
        `btn--${size}`,
        shine && "btn--shine",
        block && "btn--block",
        className
      )}
      {...rest}
    >
      {icon && (
        <span className="btn__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="btn__label">{children}</span>
    </button>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  icon: ReactNode;
  /**
   * Drop focus after a pointer click so gameplay keys (Enter/Space) never
   * re-trigger an in-game HUD button.
   */
  releaseFocus?: boolean;
}

export function IconButton({
  label,
  icon,
  className,
  releaseFocus = false,
  onClick,
  type = "button",
  ...rest
}: IconButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (releaseFocus && event.detail > 0) event.currentTarget.blur();
  };
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn("ibtn", className)}
      onClick={handleClick}
      {...rest}
    >
      {icon}
    </button>
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { fmtInt } from "@/components/ui/format";
import { CoinIcon, KeyIcon } from "@/components/ui/GameIcons";

/** Coin / Life-Saver key counter pill (menu header + HUD). */
export function CurrencyPill({
  kind,
  value,
  className,
  iconKey,
  children,
}: {
  kind: "coin" | "key";
  value: number;
  className?: string;
  /** Changing this re-mounts the icon to replay its bump animation. */
  iconKey?: number;
  children?: ReactNode;
}) {
  const noun = kind === "coin" ? "coins" : value === 1 ? "Life Saver key" : "Life Saver keys";
  return (
    <div className={cn("pill", `pill--${kind}`, className)}>
      <span className="pill__icon" key={iconKey === undefined ? "icon" : `icon-${iconKey}`} aria-hidden="true">
        {kind === "coin" ? <CoinIcon /> : <KeyIcon />}
      </span>
      <span className="pill__value" aria-hidden="true">
        {fmtInt(value)}
      </span>
      <span className="sr-only">
        {fmtInt(value)} {noun}
      </span>
      {children}
    </div>
  );
}

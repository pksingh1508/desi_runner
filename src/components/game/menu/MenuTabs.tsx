"use client";

import type { KeyboardEvent } from "react";
import { cssVars } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/Icon";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon: IconName;
}

/**
 * Segmented tab bar with a springy sliding indicator (pure CSS transform
 * driven by `--i`). Arrow keys / Home / End move between tabs.
 */
export function MenuTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  const index = Math.max(0, tabs.findIndex((tab) => tab.id === active));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    let next = index;
    if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else next = tabs.length - 1;
    onChange(tabs[next].id);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${tabs[next].id}"]`)?.focus();
  };

  return (
    <div
      className="tabs"
      role="tablist"
      aria-label="Menu sections"
      style={cssVars({ "--i": index, "--n": tabs.length })}
      onKeyDown={onKeyDown}
    >
      <span className="tabs__ind" aria-hidden="true" />
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            data-tab={tab.id}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className="tab"
            onClick={() => onChange(tab.id)}
          >
            <Icon name={tab.icon} />
            <span className="tab__label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

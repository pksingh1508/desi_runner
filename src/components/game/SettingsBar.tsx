"use client";

import { IconButton } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { SettingsActions, SettingsView } from "./settings";

type ChipKey = Exclude<keyof SettingsView, "muted">;

const CHIPS: { key: ChipKey; label: string; icon: IconName; title: string; action: keyof SettingsActions }[] = [
  { key: "sound", label: "SFX", icon: "sfx", title: "Sound effects", action: "toggleSound" },
  { key: "music", label: "MUSIC", icon: "music", title: "Music", action: "toggleMusic" },
  { key: "voice", label: "MEMES", icon: "memes", title: "Meme voice lines", action: "toggleVoice" },
  { key: "screenShake", label: "SHAKE", icon: "shake", title: "Screen shake", action: "toggleShake" },
  {
    key: "performanceMode",
    label: "PERF",
    icon: "perf",
    title: "Performance mode — lower resolution, no shadows, lighter UI effects",
    action: "togglePerformance",
  },
];

/** SFX / MUSIC / MEMES / SHAKE / PERF chips + master mute. */
export function SettingsBar({
  settings,
  actions,
  only,
  className,
}: {
  settings: SettingsView;
  actions: SettingsActions;
  /** Restrict to a subset of chips (the pause card shows audio only). */
  only?: readonly ChipKey[];
  className?: string;
}) {
  const chips = only ? CHIPS.filter((chip) => only.includes(chip.key)) : CHIPS;
  return (
    <>
      <div className={cn("settings", className)} role="group" aria-label="Settings">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className="schip"
            aria-pressed={settings[chip.key]}
            title={chip.title}
            onClick={() => actions[chip.action]()}
          >
            <Icon name={chip.icon} />
            <span className="schip__label">{chip.label}</span>
            <span className="schip__led" aria-hidden="true" />
          </button>
        ))}
        <IconButton
          className="settings__mute"
          label={settings.muted ? "Unmute all sound" : "Mute all sound"}
          icon={<Icon name={settings.muted ? "mute" : "volume"} />}
          data-muted={settings.muted}
          onClick={actions.toggleMute}
        />
      </div>
      <a className="audio-credits" href="/sounds/credits.html" target="_blank" rel="noreferrer">
        Audio credits
      </a>
    </>
  );
}

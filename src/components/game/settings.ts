import type { SettingsData } from "@/game/core/SaveService";

/** What the settings chips display (persisted settings + live master mute). */
export type SettingsView = Pick<
  SettingsData,
  "sound" | "music" | "voice" | "screenShake" | "performanceMode"
> & { muted: boolean };

/** Engine toggles, wired once in GameCanvas and shared by menu + pause. */
export interface SettingsActions {
  toggleMute: () => void;
  toggleSound: () => void;
  toggleMusic: () => void;
  toggleVoice: () => void;
  toggleShake: () => void;
  togglePerformance: () => void;
}

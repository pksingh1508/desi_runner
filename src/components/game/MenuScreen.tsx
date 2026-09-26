"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { AchievementView, MenuFocus, MissionView, PlayerStatsData } from "@/types/game";
import { useCoarsePointer } from "@/components/ui/hooks";
import { guardActivationKeys } from "@/components/ui/keyboard";
import { Garland } from "@/components/ui/Ornaments";
import { AwardsTab } from "./menu/AwardsTab";
import { CareerTab } from "./menu/CareerTab";
import { GearTab } from "./menu/GearTab";
import { MenuHeader } from "./menu/MenuHeader";
import { MenuTabs, type TabDef } from "./menu/MenuTabs";
import { MissionsTab } from "./menu/MissionsTab";
import { PlayTab } from "./menu/PlayTab";
import { RunnerNameplate } from "./menu/RunnerNameplate";
import { characterOptions } from "./meta";
import { SettingsBar } from "./SettingsBar";
import type { SettingsActions, SettingsView } from "./settings";

interface MenuScreenProps {
  bestScore: number;
  bestDistance: number;
  totalCoins: number;
  keys: number;
  missions: MissionView[];
  achievements: AchievementView[];
  stats: PlayerStatsData;
  settings: SettingsView;
  settingsActions: SettingsActions;
  onPlay: () => void;
  onEquipCharacter: (id: string) => void;
  onPreviewCharacter: (id: string | null) => void;
  onFocusChange: (focus: MenuFocus) => void;
}

type Tab = "play" | "missions" | "career" | "gear" | "awards";

const TABS: readonly TabDef<Tab>[] = [
  { id: "play", label: "PLAY", icon: "play" },
  { id: "missions", label: "MISSIONS", icon: "target" },
  { id: "career", label: "CAREER", icon: "chart" },
  { id: "gear", label: "GEAR", icon: "shirt" },
  { id: "awards", label: "AWARDS", icon: "medal" },
];

const FOCUS: Record<Tab, MenuFocus> = {
  play: "home",
  missions: "missions",
  career: "career",
  gear: "gear",
  awards: "awards",
};

/**
 * Main menu over the live 3D street. Landscape: content column on the left,
 * the runner framed on the right. Portrait: runner on top, content in a
 * bottom sheet. Tab changes drive the engine camera via setMenuFocus.
 */
export function MenuScreen(props: MenuScreenProps) {
  const [tab, setTab] = useState<Tab>("play");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const touch = useCoarsePointer();

  const reportFocus = useEffectEvent((focus: MenuFocus) => props.onFocusChange(focus));
  useEffect(() => {
    reportFocus(FOCUS[tab]);
  }, [tab]);

  const preview = (id: string | null) => {
    setPreviewId(id);
    props.onPreviewCharacter(id);
  };

  const selectTab = (next: Tab) => {
    if (next === tab) return;
    if (previewId !== null) preview(null);
    setTab(next);
  };

  const equip = (id: string) => {
    setPreviewId(null);
    props.onEquipCharacter(id);
  };

  const characters = characterOptions();
  const equipped = characters.find((c) => c.equipped) ?? characters[0];
  const previewed = previewId ? characters.find((c) => c.id === previewId) : undefined;
  const staged = previewed ?? equipped;
  const pendingMissions = props.missions.filter((m) => !m.completed);

  return (
    <div className="menu" data-active-tab={tab} onKeyDown={guardActivationKeys}>
      <MenuHeader totalCoins={props.totalCoins} keys={props.keys} />

      <section className="panel menu-col" aria-label="Main menu">
        <Garland slim className="menu-col__garland" />
        <div className="menu-col__tabs">
          <MenuTabs tabs={TABS} active={tab} onChange={selectTab} />
        </div>
        <div
          key={tab}
          className="menu-body scroll-area"
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {tab === "play" && equipped && (
            <PlayTab
              equipped={equipped}
              bestScore={props.bestScore}
              bestDistance={props.bestDistance}
              totalCoins={props.totalCoins}
              mission={pendingMissions[0] ?? null}
              missionsLeft={pendingMissions.length}
              touch={touch}
              onPlay={props.onPlay}
              onOpenGear={() => selectTab("gear")}
              onOpenMissions={() => selectTab("missions")}
            />
          )}
          {tab === "missions" && <MissionsTab missions={props.missions} />}
          {tab === "career" && <CareerTab stats={props.stats} />}
          {tab === "gear" && (
            <GearTab characters={characters} previewId={previewId} onEquip={equip} onPreview={preview} />
          )}
          {tab === "awards" && <AwardsTab achievements={props.achievements} />}
        </div>
        <footer className="menu-foot">
          <SettingsBar settings={props.settings} actions={props.settingsActions} />
        </footer>
      </section>

      <div className="menu-stage">
        {tab === "gear" && staged && (
          <RunnerNameplate key={staged.id} option={staged} previewing={Boolean(previewed)} />
        )}
      </div>
    </div>
  );
}

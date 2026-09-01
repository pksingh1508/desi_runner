"use client";

import { useEffect, useState } from "react";
import type { AchievementView, MissionView, PlayerStatsData } from "@/types/game";
import {
  careerGroups,
  characterOptions,
  levelInfo,
  trailOptions,
} from "./meta";

interface MenuScreenProps {
  bestScore: number;
  bestDistance: number;
  totalCoins: number;
  muted: boolean;
  missions: MissionView[];
  achievements: AchievementView[];
  stats: PlayerStatsData;
  settings: { screenShake: boolean; music: boolean; sound: boolean; performanceMode: boolean };
  onPlay: () => void;
  onToggleMute: () => void;
  onToggleShake: () => void;
  onToggleMusic: () => void;
  onToggleSound: () => void;
  onTogglePerformance: () => void;
  onEquipCharacter: (id: string) => void;
  onEquipTrail: (id: string) => void;
}

type Tab = "play" | "missions" | "career" | "gear" | "awards";

const TABS: { id: Tab; label: string }[] = [
  { id: "play", label: "PLAY" },
  { id: "missions", label: "MISSIONS" },
  { id: "career", label: "CAREER" },
  { id: "gear", label: "GEAR" },
  { id: "awards", label: "AWARDS" },
];

export function MenuScreen(props: MenuScreenProps) {
  const [tab, setTab] = useState<Tab>("play");
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const level = levelInfo();
  const xpFraction = Math.min(level.xpInto / Math.max(level.xpForNext, 1), 1);

  return (
    <div className="absolute inset-0 z-40 flex flex-col">
      <div className="scanlines" />

      {/* ---------------------------------------------------------- header */}
      <div className="flex items-start justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-4">
        <div>
          <h1 className="title-flicker title-glow font-retro text-2xl leading-none sm:text-3xl">
            NEON <span className="title-gold">RUN</span>
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <span className="lvl-badge font-tech">LV {level.level}</span>
            <div className="xp-track">
              <div className="xp-fill" style={{ width: `${xpFraction * 100}%` }} />
            </div>
            <span className="font-tech text-[9px] tabular-nums text-white/45">
              {level.xpInto.toLocaleString()}/{level.xpForNext.toLocaleString()} XP
            </span>
          </div>
        </div>
        <div className="stats-chip font-tech hidden items-center gap-4 px-4 py-2 text-[10px] tracking-widest sm:flex">
          <span className="text-[#d9de7a]/95">BEST {props.bestScore.toLocaleString()}</span>
          <span className="text-white/25">|</span>
          <span className="text-[#9fca7d]/95">{props.bestDistance.toLocaleString()}m</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div className="mt-4 flex justify-center gap-1.5 px-4 sm:gap-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`tab-btn font-tech ${tab === t.id ? "tab-active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* --------------------------------------------------------- content */}
      <div className="menu-scroll mt-4 flex-1 overflow-y-auto px-5 pb-2 sm:px-8">
        {tab === "play" && (
          <PlayTab
            touch={touch}
            bestScore={props.bestScore}
            bestDistance={props.bestDistance}
            totalCoins={props.totalCoins}
            missions={props.missions}
            onPlay={props.onPlay}
          />
        )}
        {tab === "missions" && <MissionsTab missions={props.missions} />}
        {tab === "career" && <CareerTab stats={props.stats} />}
        {tab === "gear" && (
          <GearTab
            onEquipCharacter={props.onEquipCharacter}
            onEquipTrail={props.onEquipTrail}
          />
        )}
        {tab === "awards" && <AwardsTab achievements={props.achievements} />}
      </div>

      {/* ---------------------------------------------------------- footer */}
      <div className="flex items-center justify-between gap-2 px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2 sm:px-8">
        <div className="font-tech text-[8px] tracking-[0.3em] text-white/25">
          RUN · DODGE · SURVIVE
        </div>
        <div className="flex gap-1.5">
          <ToggleChip label="SFX" on={props.settings.sound} onClick={props.onToggleSound} />
          <ToggleChip label="MUSIC" on={props.settings.music} onClick={props.onToggleMusic} />
          <ToggleChip label="SHAKE" on={props.settings.screenShake} onClick={props.onToggleShake} />
          <ToggleChip label="PERF" on={!props.settings.performanceMode} onClick={props.onTogglePerformance} />
          <button type="button" onClick={props.onToggleMute} aria-label="Mute" className="icon-btn">
            {props.muted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- tabs

function PlayTab({
  touch,
  bestScore,
  bestDistance,
  totalCoins,
  missions,
  onPlay,
}: {
  touch: boolean;
  bestScore: number;
  bestDistance: number;
  totalCoins: number;
  missions: MissionView[];
  onPlay: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 py-6">
      <p className="font-tech text-xs tracking-[0.45em] text-[#9fca7d]/90">
        RUN · DODGE · SURVIVE
      </p>
      <button type="button" onClick={onPlay} className="btn-neon px-16 py-4 text-sm">
        PLAY
      </button>

      {touch ? (
        <p className="font-tech text-center text-[11px] leading-relaxed tracking-widest text-white/60">
          SWIPE ← → TO CHANGE LANES · SWIPE ↑ JUMP · SWIPE ↓ SLIDE
          <br />
          DOUBLE-TAP FOR OVERDRIVE
        </p>
      ) : (
        <div className="font-tech flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] tracking-widest text-white/60">
          <span><kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd> MOVE</span>
          <span><kbd className="kbd">↑</kbd> / <kbd className="kbd">SPACE</kbd> JUMP</span>
          <span><kbd className="kbd">↓</kbd> SLIDE</span>
          <span><kbd className="kbd">E</kbd> OVERDRIVE</span>
        </div>
      )}

      <div className="stats-chip font-tech flex items-center gap-4 px-6 py-2 text-[11px] tracking-widest">
        <span className="text-[#d9de7a]/95">BEST {bestScore.toLocaleString()}</span>
        <span className="text-white/25">|</span>
        <span className="text-[#9fca7d]/95">{bestDistance.toLocaleString()}m</span>
        <span className="text-white/25">|</span>
        <span className="text-[#e8c96a]/95">✦ {totalCoins.toLocaleString()}</span>
      </div>

      {missions.some((m) => !m.completed) && (
        <div className="w-full max-w-xl">
          <p className="font-tech mb-2 text-center text-[9px] tracking-[0.35em] text-white/35">
            TODAY&apos;S MISSIONS
          </p>
          <MissionCard mission={missions.find((m) => !m.completed)!} compact />
        </div>
      )}
    </div>
  );
}

function MissionsTab({ missions }: { missions: MissionView[] }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 py-2">
      <SectionTitle>DAILY MISSIONS</SectionTitle>
      {missions.map((mission) => (
        <MissionCard key={mission.title + mission.target} mission={mission} />
      ))}
    </div>
  );
}

function MissionCard({ mission, compact }: { mission: MissionView; compact?: boolean }) {
  const fraction = Math.min(mission.progress / Math.max(mission.target, 1), 1);
  return (
    <div className={`hud-panel px-4 py-3 ${compact ? "" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-base text-[#d9de7a]">{mission.icon}</span>
          <div>
            <div className="font-tech text-[11px] tracking-[0.18em] text-[#f4f6d0]">
              {mission.title}
            </div>
            <div className="font-tech text-[9px] tracking-wider text-white/50">
              {mission.description}
            </div>
          </div>
        </div>
        <div className="font-tech whitespace-nowrap text-right text-[9px] leading-relaxed text-[#e8c96a]/90">
          +{mission.rewardXp} XP
          <br />+{mission.rewardCoins} ✦
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="progress-track flex-1">
          <div className="progress-fill" style={{ width: `${fraction * 100}%` }} />
        </div>
        <span className="font-tech text-[9px] tabular-nums text-white/55">
          {mission.completed ? "DONE ✓" : `${Math.floor(mission.progress)} / ${mission.target}`}
        </span>
      </div>
    </div>
  );
}

function CareerTab({ stats }: { stats: PlayerStatsData }) {
  const groups = careerGroups(stats);
  return (
    <div className="mx-auto grid max-w-2xl gap-3 py-2 sm:grid-cols-2">
      {groups.map((group) => (
        <div key={group.label} className="hud-panel px-4 py-3">
          <div className="font-tech mb-2 text-[9px] tracking-[0.35em] text-[#d9de7a]/80">
            {group.label}
          </div>
          {group.rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between border-t border-white/5 py-1.5 first:border-t-0">
              <span className="font-tech text-[10px] tracking-wider text-white/55">{row.label}</span>
              <span className="font-tech text-[12px] tabular-nums text-[#eef3e4]">{row.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GearTab({
  onEquipCharacter,
  onEquipTrail,
}: {
  onEquipCharacter: (id: string) => void;
  onEquipTrail: (id: string) => void;
}) {
  const characters = characterOptions();
  const trails = trailOptions();
  return (
    <div className="mx-auto max-w-3xl pb-2">
      <SectionTitle>CHARACTERS — 8 UNIQUE RUNNERS</SectionTitle>
      <p className="font-tech mb-2 text-center text-[8px] tracking-[0.18em] text-white/30">
        BOY · GIRL · ROBOTS · ALIENS — EACH WITH A DISTINCT 3D MODEL
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {characters.map((option) => (
          <CharacterGearCard
            key={option.id}
            option={option}
            onEquip={() => onEquipCharacter(option.id)}
          />
        ))}
      </div>

      <SectionTitle>TRAILS</SectionTitle>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        {trails.map((option) => (
          <GearCard
            key={option.id}
            name={option.name}
            locked={option.locked}
            equipped={option.equipped}
            unlockLabel={option.unlockLabel}
            swatch={`linear-gradient(135deg,#10151a,${option.colorHex})`}
            onEquip={() => onEquipTrail(option.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CharacterGearCard({
  option,
  onEquip,
}: {
  option: import("@/types/game").CharacterOptionView;
  onEquip: () => void;
}) {
  return (
    <button
      type="button"
      disabled={option.locked}
      onClick={onEquip}
      className={`hud-panel gear-card character-card relative overflow-hidden px-3 py-3 text-left ${option.equipped ? "gear-equipped" : ""} ${option.locked ? "opacity-90" : ""}`}
    >
      {/* Gradient preview with large icon — this is the "character" thumbnail */}
      <div
        className="relative mb-2.5 flex h-[68px] w-full items-center justify-center overflow-hidden rounded-md border border-white/10"
        style={{ background: option.gradient, opacity: option.locked ? 0.55 : 1 }}
      >
        {/* Subtle inner glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/10" />
        <span
          className="relative text-[34px] leading-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]"
          style={{ filter: option.locked ? "grayscale(0.85) brightness(0.6)" : undefined }}
          aria-hidden
        >
          {option.icon}
        </span>
        {/* Species pill */}
        <span
          className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 font-tech text-[7px] font-bold tracking-[0.14em] text-white shadow"
          style={{
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(4px)",
          }}
        >
          {option.species}
        </span>
        {/* Lock overlay */}
        {option.locked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[0.5px]">
            <span className="rounded-full bg-black/60 px-2 py-1 font-tech text-[10px] tracking-[0.16em] text-white/90">🔒 LOCKED</span>
          </div>
        )}
      </div>

      <div className="font-tech text-[11px] font-bold tracking-[0.18em] text-[#f4f6d0]">{option.name}</div>
      <div className="font-tech mt-0.5 line-clamp-2 text-[9px] leading-snug tracking-wide text-white/55">{option.description}</div>
      <div
        className={`font-tech mt-2 inline-flex items-center rounded-full px-2 py-1 text-[8px] font-bold tracking-[0.16em] ${
          option.locked
            ? "bg-white/5 text-white/40"
            : option.equipped
              ? "bg-[#e8c96a] text-[#241c05] shadow-[0_0_10px_rgba(232,201,106,0.45)]"
              : "bg-white/10 text-white/70"
        }`}
      >
        {option.locked ? `🔒 ${option.unlockLabel}` : option.equipped ? "● EQUIPPED" : "READY — TAP TO EQUIP"}
      </div>
      {option.equipped && <div className="gear-dot" />}
    </button>
  );
}

function GearCard({
  name,
  locked,
  equipped,
  unlockLabel,
  swatch,
  onEquip,
}: {
  name: string;
  locked: boolean;
  equipped: boolean;
  unlockLabel: string;
  swatch: string;
  onEquip: () => void;
}) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onEquip}
      className={`hud-panel gear-card relative overflow-hidden px-3 py-3 text-left ${equipped ? "gear-equipped" : ""}`}
    >
      <div className="mb-2 h-14 w-full rounded-md" style={{ background: swatch, opacity: locked ? 0.25 : 1 }} />
      <div className="font-tech text-[10px] tracking-[0.2em] text-[#f4f6d0]">{name}</div>
      <div className="font-tech mt-0.5 text-[8px] tracking-[0.2em] text-white/40">
        {locked ? `🔒 ${unlockLabel}` : equipped ? "EQUIPPED" : "READY"}
      </div>
      {equipped && <div className="gear-dot" />}
    </button>
  );
}

function AwardsTab({ achievements }: { achievements: AchievementView[] }) {
  const done = achievements.filter((a) => a.completed).length;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-2.5 py-2">
      <SectionTitle>{`ACHIEVEMENTS · ${done}/${achievements.length}`}</SectionTitle>
      {achievements.map((achievement) => {
        const fraction = Math.min(achievement.progress / Math.max(achievement.target, 1), 1);
        return (
          <div
            key={achievement.id}
            className={`hud-panel flex items-center gap-3 px-4 py-2.5 ${achievement.completed ? "award-done" : ""}`}
          >
            <span className={`w-7 text-center text-base ${achievement.completed ? "" : "opacity-45"}`}>
              {achievement.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-tech truncate text-[11px] tracking-[0.15em] text-[#f4f6d0]">
                  {achievement.title}
                </span>
                <span className="font-tech whitespace-nowrap text-[8px] text-[#e8c96a]/85">
                  +{achievement.rewardXp} XP · +{achievement.rewardCoins} ✦
                </span>
              </div>
              <div className="font-tech truncate text-[9px] text-white/45">{achievement.description}</div>
              {!achievement.completed && (
                <div className="progress-track mt-1 h-1">
                  <div className="progress-fill" style={{ width: `${fraction * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-tech mt-2 mb-1 text-center text-[9px] tracking-[0.35em] text-white/35">
      {children}
    </p>
  );
}

function ToggleChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`toggle-chip font-tech ${on ? "toggle-on" : "toggle-off"}`}
      aria-pressed={on}
    >
      {label}
    </button>
  );
}

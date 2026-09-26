"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Game } from "@/game/Game";
import { REVIVE } from "@/game/config/gameplay";
import { GameStore } from "@/game/GameStore";
import { SaveService } from "@/game/core/SaveService";
import type { RunResult } from "@/types/game";
import { Presence } from "@/components/ui/Presence";
import { LoadingScreen } from "./LoadingScreen";
import { MenuScreen } from "./MenuScreen";
import { CountdownOverlay } from "./CountdownOverlay";
import { GameHUD } from "./GameHUD";
import { PauseScreen } from "./PauseScreen";
import { RunSummaryScreen } from "./RunSummaryScreen";
import { ReviveScreen } from "./ReviveScreen";
import { MemeLayer } from "./hud/MemeLayer";
import { CrashBeat } from "./CrashBeat";
import { DebugPanel } from "./DebugPanel";
import type { SettingsActions, SettingsView } from "./settings";


/**
 * Client boundary for the whole game. The Three.js world is created exactly
 * once inside an effect (never during SSR) and torn down deterministically,
 * so hot reloads and navigation cannot leak render loops. React only renders
 * overlays; every animation is CSS so gameplay never waits on React.
 */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const storeRef = useRef<GameStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new GameStore();
  }
  const store = storeRef.current;

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const game = new Game(host, store);
    gameRef.current = game;
    game.init();
    // Dev-only debug handle (`__desiGame` in the console); never in production.
    const debugWindow = window as unknown as { __desiGame?: Game };
    if (process.env.NODE_ENV !== "production") debugWindow.__desiGame = game;
    return () => {
      game.dispose();
      gameRef.current = null;
      if (debugWindow.__desiGame === game) delete debugWindow.__desiGame;
    };
  }, [store]);

  const game = () => gameRef.current!;

  // Keep the last run result so the summary can animate out after restart
  // clears it from the store.
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  if (snapshot.runResult && snapshot.runResult !== lastResult) {
    setLastResult(snapshot.runResult);
  }

  const state = snapshot.gameState;

  // Meta views re-read whenever the engine bumps metaVersion (run end, equips).
  void snapshot.metaVersion;
  const save = typeof window === "undefined" ? null : SaveService.get();
  const missions = gameRef.current && save ? gameRef.current.getMissionViews() : [];
  const achievements = gameRef.current && save ? gameRef.current.getAchievementViews() : [];
  const stats = save?.stats;

  const settings: SettingsView = {
    muted: snapshot.muted,
    sound: save?.settings.sound ?? true,
    music: save?.settings.music ?? true,
    voice: save?.settings.voice ?? true,
    screenShake: save?.settings.screenShake ?? true,
    performanceMode: save?.settings.performanceMode ?? false,
  };

  const settingsActions: SettingsActions = {
    toggleMute: () => game().toggleMute(),
    toggleSound: () => game().toggleSound(),
    toggleMusic: () => game().toggleMusic(),
    toggleVoice: () => game().toggleVoice(),
    toggleShake: () => game().toggleShake(),
    togglePerformance: () => game().togglePerformanceMode(),
  };

  const inRun = state === "countdown" || state === "playing" || state === "revive" || state === "paused";
  const crashBeat = state === "gameover" && !snapshot.runResult;
  const memesVisible = state === "countdown" || state === "playing" || state === "revive" || crashBeat;

  return (
    <div
      className="game-root"
      data-state={state}
      data-perf={state !== "loading" && settings.performanceMode ? "lite" : undefined}
    >
      {/* WebGL canvas host */}
      <div ref={hostRef} className="game-host" />

      {/* Readability vignette (tuned per state in CSS) */}
      <div className="game-vignette" aria-hidden="true" />

      <Presence show={inRun} exitMs={260}>
        <GameHUD
          score={snapshot.score}
          distance={snapshot.distance}
          coins={snapshot.coins}
          keys={snapshot.keys}
          tierName={snapshot.tierName}
          tierLabel={snapshot.tierLabel}
          popupSeq={snapshot.popupSeq}
          muted={snapshot.muted}
          onPause={() => game().pause()}
          onToggleMute={() => game().toggleMute()}
          interactive={state === "playing"}
          comboCount={snapshot.comboCount}
          comboMult={snapshot.comboMult}
          powerups={snapshot.powerups}
          odEnergy={snapshot.odEnergy}
          odReady={snapshot.odReady}
          odActive={snapshot.odActive}
          odRemaining={snapshot.odRemaining}
          shieldActive={snapshot.shieldActive}
          sectorName={snapshot.sectorName}
          feedback={snapshot.feedback}
          banner={snapshot.banner}
          rocketActive={snapshot.rocketActive}
          rocketTimeLeft={snapshot.rocketTimeLeft}
          rocketDuration={snapshot.rocketDuration}
        />
      </Presence>

      {(state === "countdown" || state === "playing") && (
        <CountdownOverlay value={snapshot.countdownValue} visible={state === "countdown"} />
      )}

      {crashBeat && <CrashBeat />}

      <Presence show={state === "menu" && Boolean(stats)} exitMs={360}>
        {stats && (
          <MenuScreen
            bestScore={snapshot.bestScore}
            bestDistance={snapshot.bestDistance}
            totalCoins={stats.totalCoins}
            keys={snapshot.keys}
            missions={missions}
            achievements={achievements}
            stats={stats}
            settings={settings}
            settingsActions={settingsActions}
            onPlay={() => game().startRun()}
            onEquipCharacter={(id) => game().equipCharacter(id)}
            onPreviewCharacter={(id) => game().previewCharacter(id)}
            onFocusChange={(focus) => game().setMenuFocus(focus)}
          />
        )}
      </Presence>

      <Presence show={state === "revive"} exitMs={280}>
        <ReviveScreen
          keys={snapshot.keys}
          countdown={snapshot.reviveCountdown}
          totalSeconds={REVIVE.seconds}
          onRevive={() => game().tryRevive()}
          onSkip={() => game().skipRevive()}
        />
      </Presence>

      <Presence show={state === "paused"} exitMs={260}>
        <PauseScreen
          score={snapshot.score}
          distance={snapshot.distance}
          coins={snapshot.coins}
          settings={settings}
          settingsActions={settingsActions}
          onResume={() => game().resume()}
          onRestart={() => game().startRun()}
          onMenu={() => game().returnToMenu()}
        />
      </Presence>

      <Presence show={state === "gameover" && Boolean(snapshot.runResult)} exitMs={320}>
        {lastResult && (
          <RunSummaryScreen
            result={lastResult}
            bestScore={snapshot.bestScore}
            bestDistance={snapshot.bestDistance}
            onRestart={() => game().startRun()}
            onMenu={() => game().returnToMenu()}
          />
        )}
      </Presence>

      {memesVisible && <MemeLayer items={snapshot.feedback} />}

      <Presence show={state === "loading"} exitMs={520}>
        <LoadingScreen progress={snapshot.loadingProgress} label={snapshot.loadingLabel} error={snapshot.error} />
      </Presence>

      <DebugPanel getDebug={() => gameRef.current?.getDebugInfo() ?? null} />
    </div>
  );
}

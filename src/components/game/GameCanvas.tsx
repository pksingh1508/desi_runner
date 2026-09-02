"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Game } from "@/game/Game";
import { GameStore } from "@/game/GameStore";
import { SaveService } from "@/game/core/SaveService";
import { LoadingScreen } from "./LoadingScreen";
import { MenuScreen } from "./MenuScreen";
import { CountdownOverlay } from "./CountdownOverlay";
import { GameHUD } from "./GameHUD";
import { PauseScreen } from "./PauseScreen";
import { RunSummaryScreen } from "./RunSummaryScreen";
import { DebugPanel } from "./DebugPanel";

/**
 * Client boundary for the whole game. The Three.js world is created exactly
 * once inside an effect (never during SSR) and torn down deterministically,
 * so hot reloads and navigation cannot leak render loops.
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
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [store]);

  const game = () => gameRef.current!;

  // Meta views re-read whenever the engine bumps metaVersion (run end, equips).
  void snapshot.metaVersion;
  const save = typeof window === "undefined" ? null : SaveService.get();
  const missions = gameRef.current && save ? gameRef.current.getMissionViews() : [];
  const achievements = gameRef.current && save ? gameRef.current.getAchievementViews() : [];
  const stats = save?.stats;

  return (
    <div className="fixed inset-0 h-dvh w-screen overflow-hidden bg-[#8ecfff] text-white select-none">
      {/* WebGL canvas host */}
      <div ref={hostRef} className="absolute inset-0 touch-none" />

      {/* Vignette overlay for readability */}
      <div className="pointer-events-none absolute inset-0 vignette" />

      {snapshot.gameState === "loading" && (
        <LoadingScreen progress={snapshot.loadingProgress} label={snapshot.loadingLabel} error={snapshot.error} />
      )}

      {snapshot.gameState === "menu" && stats && (
        <MenuScreen
          bestScore={snapshot.bestScore}
          bestDistance={snapshot.bestDistance}
          totalCoins={stats.totalCoins}
          muted={snapshot.muted}
          missions={missions}
          achievements={achievements}
          stats={stats}
          settings={SaveService.get().settings}
          onPlay={() => game().startRun()}
          onToggleMute={() => game().toggleMute()}
          onToggleShake={() => game().toggleShake()}
          onToggleMusic={() => game().toggleMusic()}
          onToggleSound={() => game().toggleSound()}
          onTogglePerformance={() => game().togglePerformanceMode()}
          onEquipCharacter={(id) => game().equipCharacter(id)}
          onEquipTrail={(id) => game().equipTrail(id)}
        />
      )}

      {(snapshot.gameState === "countdown" || snapshot.gameState === "playing") && (
        <>
          <GameHUD
            score={snapshot.score}
            distance={snapshot.distance}
            coins={snapshot.coins}
            tierName={snapshot.tierName}
            tierLabel={snapshot.tierLabel}
            popupSeq={snapshot.popupSeq}
            muted={snapshot.muted}
            onPause={() => game().pause()}
            onToggleMute={() => game().toggleMute()}
            interactive={snapshot.gameState === "playing"}
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
          />
          <CountdownOverlay value={snapshot.countdownValue} visible={snapshot.gameState === "countdown"} />
        </>
      )}

      {snapshot.gameState === "paused" && (
        <PauseScreen
          onResume={() => game().resume()}
          onRestart={() => game().startRun()}
          onMenu={() => game().returnToMenu()}
        />
      )}

      {snapshot.gameState === "gameover" && snapshot.runResult && (
        <RunSummaryScreen
          result={snapshot.runResult}
          bestScore={snapshot.bestScore}
          bestDistance={snapshot.bestDistance}
          onRestart={() => game().startRun()}
          onMenu={() => game().returnToMenu()}
        />
      )}

      <DebugPanel getDebug={() => game()?.getDebugInfo() ?? null} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Game } from "@/game/Game";
import { GameStore } from "@/game/GameStore";
import { LoadingScreen } from "./LoadingScreen";
import { StartScreen } from "./StartScreen";
import { CountdownOverlay } from "./CountdownOverlay";
import { GameHUD } from "./GameHUD";
import { PauseScreen } from "./PauseScreen";
import { GameOverScreen } from "./GameOverScreen";
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

  const game = () => gameRef.current;

  return (
    <div className="fixed inset-0 h-dvh w-screen overflow-hidden bg-[#05060e] text-white select-none">
      {/* WebGL canvas host */}
      <div ref={hostRef} className="absolute inset-0 touch-none" />

      {/* Vignette overlay for readability */}
      <div className="pointer-events-none absolute inset-0 vignette" />

      {snapshot.gameState === "loading" && (
        <LoadingScreen progress={snapshot.loadingProgress} label={snapshot.loadingLabel} error={snapshot.error} />
      )}

      {snapshot.gameState === "menu" && (
        <StartScreen
          bestScore={snapshot.bestScore}
          bestDistance={snapshot.bestDistance}
          totalCoins={snapshot.totalCoins}
          muted={snapshot.muted}
          onPlay={() => game().startRun()}
          onToggleMute={() => game().toggleMute()}
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
        <GameOverScreen
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

/** Tiny helper hook kept local to avoid extra dependency surface. */
export function useDevFlag(): boolean {
  const [isDev] = useState(() => process.env.NODE_ENV === "development");
  useEffect(() => void isDev, [isDev]);
  return isDev;
}

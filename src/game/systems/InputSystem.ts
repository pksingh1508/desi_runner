import type { GameAction } from "@/types/game";

export type ActionHandler = (action: GameAction) => void;

/**
 * Centralized input: keyboard on window, swipe gestures on the game host.
 * All gameplay input flows through one handler owned by Game so UI components
 * never bind game logic themselves.
 */
export class InputSystem {
  private handler: ActionHandler;
  private host: HTMLElement;

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const action = this.mapKey(event.code);
    if (!action) return;
    // Stop the page from scrolling / focusing buttons during play.
    if (
      event.code === "Space" ||
      event.code.startsWith("Arrow") ||
      event.code === "Escape"
    ) {
      event.preventDefault();
    }
    this.handler(action);
  };

  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  /** Double-tap detection for the mobile Overdrive trigger. */
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private static readonly DOUBLE_TAP_WINDOW_MS = 320;
  private static readonly DOUBLE_TAP_RADIUS_PX = 48;

  private onPointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    const threshold = 26;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      // Tap — check for a double-tap (Overdrive). Swipes never reach here,
      // so there is no gesture conflict.
      const now = performance.now();
      const near =
        Math.abs(event.clientX - this.lastTapX) < InputSystem.DOUBLE_TAP_RADIUS_PX &&
        Math.abs(event.clientY - this.lastTapY) < InputSystem.DOUBLE_TAP_RADIUS_PX;
      if (near && now - this.lastTapTime < InputSystem.DOUBLE_TAP_WINDOW_MS) {
        this.lastTapTime = 0;
        this.handler("overdrive");
      } else {
        this.lastTapTime = now;
        this.lastTapX = event.clientX;
        this.lastTapY = event.clientY;
      }
      return;
    }
    this.lastTapTime = 0;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.handler(dx > 0 ? "right" : "left");
    } else {
      this.handler(dy > 0 ? "slide" : "jump");
    }
  };

  private onPointerCancel = (): void => {
    this.pointerId = null;
  };

  private onTouchMove = (event: TouchEvent): void => {
    event.preventDefault();
  };

  constructor(host: HTMLElement, handler: ActionHandler) {
    this.host = host;
    this.handler = handler;
    window.addEventListener("keydown", this.onKeyDown);
    host.addEventListener("pointerdown", this.onPointerDown);
    host.addEventListener("pointerup", this.onPointerUp);
    host.addEventListener("pointercancel", this.onPointerCancel);
    // Belt-and-braces against pull-to-refresh / scroll chaining while playing.
    host.addEventListener("touchmove", this.onTouchMove, { passive: false });
  }

  private mapKey(code: string): GameAction | null {
    switch (code) {
      case "ArrowLeft":
      case "KeyA":
        return "left";
      case "ArrowRight":
      case "KeyD":
        return "right";
      case "ArrowUp":
      case "KeyW":
      case "Space":
        return "jump";
      case "ArrowDown":
      case "KeyS":
        return "slide";
      case "Escape":
      case "KeyP":
        return "pause";
      case "Enter":
        return "confirm";
      case "KeyE":
        return "overdrive";
      default:
        return null;
    }
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    this.host.removeEventListener("pointerdown", this.onPointerDown);
    this.host.removeEventListener("pointerup", this.onPointerUp);
    this.host.removeEventListener("pointercancel", this.onPointerCancel);
    this.host.removeEventListener("touchmove", this.onTouchMove);
  }
}

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
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return; // tap — buttons handle clicks
    if (Math.abs(dx) > Math.abs(dy)) {
      this.handler(dx > 0 ? "right" : "left");
    } else {
      this.handler(dy > 0 ? "slide" : "jump");
    }
  };

  private onPointerCancel = (): void => {
    this.pointerId = null;
  };

  constructor(host: HTMLElement, handler: ActionHandler) {
    this.host = host;
    this.handler = handler;
    window.addEventListener("keydown", this.onKeyDown);
    host.addEventListener("pointerdown", this.onPointerDown);
    host.addEventListener("pointerup", this.onPointerUp);
    host.addEventListener("pointercancel", this.onPointerCancel);
    // Belt-and-braces against pull-to-refresh / scroll chaining while playing.
    host.addEventListener(
      "touchmove",
      (e) => e.preventDefault(),
      { passive: false }
    );
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
      default:
        return null;
    }
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    this.host.removeEventListener("pointerdown", this.onPointerDown);
    this.host.removeEventListener("pointerup", this.onPointerUp);
    this.host.removeEventListener("pointercancel", this.onPointerCancel);
  }
}

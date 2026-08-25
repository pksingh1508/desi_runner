import * as THREE from "three";
import type { ResourceBag } from "@/game/utils/dispose";

export interface RendererHandle {
  renderer: THREE.WebGLRenderer;
  resize(width: number, height: number): void;
  dispose(): void;
}

function isLowPowerDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) < 820;
  return coarsePointer || smallViewport;
}

/** Creates and configures the single WebGLRenderer for the app. Throws when WebGL is unavailable. */
export function createRenderer(host: HTMLElement, bag: ResourceBag): RendererHandle {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    throw new Error(
      "WebGL is not available in this browser. NEON RUN needs hardware-accelerated WebGL to start."
    );
  }

  if (!renderer.getContext()) {
    renderer.dispose();
    throw new Error("WebGL context could not be created.");
  }

  const pixelRatioCap = isLowPowerDevice() ? 1.75 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  host.appendChild(canvas);

  return {
    renderer,
    resize(width: number, height: number) {
      renderer.setSize(width, height, false);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      canvas.parentElement?.removeChild(canvas);
    },
  };
}

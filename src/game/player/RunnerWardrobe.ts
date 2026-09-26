import { AssetManager } from "@/game/core/AssetManager";
import { SaveService } from "@/game/core/SaveService";
import { MODEL_URL } from "@/game/config/gameplay";
import { DEFAULT_CHARACTER_ID, getCharacter, type CharacterDefinition } from "@/game/config/characters";
import { HumanAssetLibrary } from "./human/HumanAssets";
import type { Player } from "./Player";

/**
 * Which runner is on the street: resolves the equipped character from the
 * save (one-time desi migration + self-healing), loads assets lazily (human
 * bodies/hair/clips, or the VECTOR robot GLB only when needed) and applies
 * the rig to the Player. Every request carries a sequence id, so a slow load
 * can never override a newer equip or preview.
 */
export class RunnerWardrobe {
  private library = new HumanAssetLibrary();
  private robotLoad: Promise<void> | null = null;
  private requestId = 0;
  private disposed = false;

  constructor(private player: Player) {
    player.setHumanLibrary(this.library);
  }

  /**
   * Boot: loads + applies the equipped runner, reporting progress. Resolves
   * even if assets fail (the placeholder bot keeps the game playable), then
   * warms the other body in the background so GEAR swaps are instant.
   */
  async loadInitial(onProgress: (ratio: number) => void): Promise<void> {
    const character = this.resolveEquipped();
    const id = ++this.requestId;
    try {
      await this.prepare(character, onProgress);
      if (!this.disposed && id === this.requestId) this.player.applyCharacter(character);
    } catch (error) {
      if (!this.disposed) console.error("[DESI RUN] character load failed:", error);
    }
    if (this.disposed) return;
    const otherBody = character.outfit?.body === "female" ? "male" : "female";
    void this.library.prepare(otherBody).catch(() => undefined);
  }

  /** Re-applies the equipped runner (after equip, or to end a preview). */
  applyEquipped(celebrate = false): void {
    this.show(this.resolveEquipped(), celebrate);
  }

  /** Shows any runner (locked ones included) without equipping it. */
  preview(id: string): void {
    const character = getCharacter(id);
    if (character.id !== id) return;
    this.show(character, true);
  }

  /**
   * Equipped runner from the save, with the one-time switch to the desi
   * squad and self-healing (a locked/unknown pick falls back to the default).
   */
  resolveEquipped(): CharacterDefinition {
    // Legacy saves equipped a stylized classic rig; RAJU becomes the runner
    // once (classics stay unlocked in GEAR).
    if (!SaveService.get().customization.desiRunnerV1) {
      SaveService.update((s) => {
        if (getCharacter(s.customization.character).group === "classic") {
          s.customization.character = DEFAULT_CHARACTER_ID;
        }
        s.customization.desiMigrated = true;
        s.customization.desiRunnerV1 = true;
      });
    }
    const save = SaveService.get();
    let character = getCharacter(save.customization.character);
    if (character.id !== save.customization.character || save.progression.level < character.unlockLevel) {
      character = getCharacter(DEFAULT_CHARACTER_ID);
      SaveService.update((s) => {
        s.customization.character = character.id;
      });
    }
    return character;
  }

  private show(character: CharacterDefinition, celebrate: boolean): void {
    const id = ++this.requestId;
    if (this.player.applyCharacter(character)) {
      if (celebrate) this.player.celebrate(2.4);
      return;
    }
    this.prepare(character)
      .then(() => {
        if (this.disposed || id !== this.requestId) return;
        if (this.player.applyCharacter(character) && celebrate) this.player.celebrate(2.4);
      })
      .catch((error) => {
        if (!this.disposed) console.error("[DESI RUN] runner load failed:", error);
      });
  }

  private prepare(def: CharacterDefinition, onProgress?: (ratio: number) => void): Promise<void> {
    if (def.archetype === "human" && def.outfit) return this.library.prepare(def.outfit.body, onProgress);
    if (def.archetype === "robot") return this.ensureRobotModel(onProgress);
    onProgress?.(1);
    return Promise.resolve();
  }

  /** VECTOR's CC0 robot GLB — loaded on first use only. */
  private ensureRobotModel(onProgress?: (ratio: number) => void): Promise<void> {
    if (!this.robotLoad) {
      const manager = new AssetManager((ratio) => onProgress?.(ratio));
      this.robotLoad = manager
        .loadAll({ character: MODEL_URL })
        .then((assets) => {
          if (!this.disposed) this.player.provideRobotModel(assets.character);
        })
        .catch((error) => {
          this.robotLoad = null;
          throw error;
        });
    }
    return this.robotLoad;
  }

  /** Call after Player.dispose() — rigs share this library's geometry/textures. */
  dispose(): void {
    this.disposed = true;
    this.library.dispose();
  }
}

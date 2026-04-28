import { CardQueue } from "./card-queue";
import { Soundscape } from "./soundscape";

type LayoutMode = "left-right" | "top-bottom";

interface PersistedPipelineMenuState {
  version: 1;
  layoutMode: LayoutMode;
  musicTrackIndex: number;
  sfxEnabled: boolean;
  flipX: boolean;
}

interface PipelineMenuControllerOptions {
  canvasStack: HTMLElement;
  historyQueue: CardQueue;
  ideaQueue: CardQueue;
  soundscape: Soundscape;
}

const MENU_STATE_STORAGE_KEY = "ink-form.menu-state";
const MUSIC_TOGGLE_ID = "music-toggle";
const SFX_TOGGLE_ID = "sfx-toggle";
const LAYOUT_TOGGLE_ID = "layout-toggle";
const FLIP_TOGGLE_ID = "flip-toggle";

function getRequiredButton(buttonId: string): HTMLButtonElement {
  return document.getElementById(buttonId) as HTMLButtonElement;
}

function parsePersistedMenuState(rawValue: string | null, totalTracks: number): PersistedPipelineMenuState | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedPipelineMenuState>;
    if (parsed.version !== 1) {
      return null;
    }

    const layoutMode = parsed.layoutMode === "top-bottom" ? "top-bottom" : parsed.layoutMode === "left-right" ? "left-right" : null;
    if (!layoutMode || typeof parsed.sfxEnabled !== "boolean" || typeof parsed.flipX !== "boolean") {
      return null;
    }

    const musicTrackIndex = Number(parsed.musicTrackIndex);
    if (!Number.isInteger(musicTrackIndex)) {
      return null;
    }

    return {
      version: 1,
      layoutMode,
      musicTrackIndex: musicTrackIndex >= 0 ? musicTrackIndex % totalTracks : -1,
      sfxEnabled: parsed.sfxEnabled,
      flipX: parsed.flipX,
    };
  } catch {
    return null;
  }
}

export class PipelineMenuController {
  private readonly canvasStack: HTMLElement;
  private readonly historyQueue: CardQueue;
  private readonly ideaQueue: CardQueue;
  private readonly soundscape: Soundscape;
  private readonly musicToggle: HTMLButtonElement;
  private readonly sfxToggle: HTMLButtonElement;
  private readonly layoutToggle: HTMLButtonElement;
  private readonly flipToggle: HTMLButtonElement;

  private layoutMode: LayoutMode = "left-right";
  private isCanvasAnchored = false;

  private readonly handleMusicToggleClick = () => {
    const nextTrackIndex = this.soundscape.currentTrackIndex + 1;
    this.setMusicTrackIndex(nextTrackIndex >= this.soundscape.totalTracks ? -1 : nextTrackIndex);
  };

  private readonly handleSfxToggleClick = () => {
    this.soundscape.setSfxEnabled(!this.soundscape.sfxEnabled);
    this.render();
    this.persist();
  };

  private readonly handleLayoutToggleClick = () => {
    this.layoutMode = this.layoutMode === "left-right" ? "top-bottom" : "left-right";
    this.applyLayout();
    this.render();
    this.persist();
  };

  private readonly handleFlipToggleClick = () => {
    document.body.classList.toggle("flip-x");
    this.render();
    this.persist();
  };

  constructor(options: PipelineMenuControllerOptions) {
    this.canvasStack = options.canvasStack;
    this.historyQueue = options.historyQueue;
    this.ideaQueue = options.ideaQueue;
    this.soundscape = options.soundscape;
    this.musicToggle = getRequiredButton(MUSIC_TOGGLE_ID);
    this.sfxToggle = getRequiredButton(SFX_TOGGLE_ID);
    this.layoutToggle = getRequiredButton(LAYOUT_TOGGLE_ID);
    this.flipToggle = getRequiredButton(FLIP_TOGGLE_ID);

    this.restore();

    this.musicToggle.addEventListener("click", this.handleMusicToggleClick);
    this.sfxToggle.addEventListener("click", this.handleSfxToggleClick);
    this.layoutToggle.addEventListener("click", this.handleLayoutToggleClick);
    this.flipToggle.addEventListener("click", this.handleFlipToggleClick);

    this.render();
  }

  setCanvasAnchoring(enabled: boolean): void {
    if (this.isCanvasAnchored === enabled) {
      return;
    }

    this.isCanvasAnchored = enabled;
    this.applyQueueAnchoring();
  }

  private restore(): void {
    const persisted = parsePersistedMenuState(window.localStorage.getItem(MENU_STATE_STORAGE_KEY), this.soundscape.totalTracks);
    if (!persisted) {
      this.applyLayout();
      return;
    }

    this.layoutMode = persisted.layoutMode;
    this.soundscape.setSfxEnabled(persisted.sfxEnabled);
    document.body.classList.toggle("flip-x", persisted.flipX);
    this.applyLayout();
    this.setMusicTrackIndex(persisted.musicTrackIndex, { persist: false });
  }

  private applyLayout(): void {
    if (this.layoutMode === "top-bottom") {
      this.ideaQueue.setSide("top");
      this.historyQueue.setSide("bottom");
    } else {
      this.ideaQueue.setSide("right");
      this.historyQueue.setSide("left");
    }

    this.applyQueueAnchoring();
  }

  private applyQueueAnchoring(): void {
    this.ideaQueue.setMappingMode(this.isCanvasAnchored, this.canvasStack);
    this.historyQueue.setMappingMode(this.isCanvasAnchored, this.canvasStack);
  }

  private setMusicTrackIndex(trackIndex: number, options: { persist?: boolean } = {}): void {
    if (trackIndex < 0) {
      this.soundscape.stopBackground();
    } else {
      this.soundscape.startBackground(trackIndex).catch((error) => {
        console.error("Failed to start music:", error);
      });
    }

    this.render();
    if (options.persist !== false) {
      this.persist();
    }
  }

  private render(): void {
    this.musicToggle.textContent = this.soundscape.currentTrackIndex === -1 ? "Music: Off" : `Music: ${this.soundscape.currentTrackIndex + 1}`;
    this.sfxToggle.textContent = this.soundscape.sfxEnabled ? "SFX: On" : "SFX: Off";
    this.layoutToggle.textContent = this.layoutMode === "top-bottom" ? "Layout: Top-Bottom" : "Layout: Left-Right";
    this.flipToggle.textContent = document.body.classList.contains("flip-x") ? "Flip: On" : "Flip: Off";
  }

  private persist(): void {
    const payload: PersistedPipelineMenuState = {
      version: 1,
      layoutMode: this.layoutMode,
      musicTrackIndex: this.soundscape.currentTrackIndex,
      sfxEnabled: this.soundscape.sfxEnabled,
      flipX: document.body.classList.contains("flip-x"),
    };

    window.localStorage.setItem(MENU_STATE_STORAGE_KEY, JSON.stringify(payload));
  }
}

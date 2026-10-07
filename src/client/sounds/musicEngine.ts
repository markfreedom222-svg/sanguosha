import { resourceManager } from '../resources';
import { DEFAULT_MUSIC_VOLUME, MUSIC_OUTPUT_GAIN } from './musicLevels';

/** Streaming, looping music element, independent of the Web Audio effects bus. */
export class MusicEngine {
  private audio: HTMLAudioElement | null = null;
  private unlocked = false;
  private volume = DEFAULT_MUSIC_VOLUME;
  private muted = false;
  private url: string | null = null;

  isUnlocked(): boolean { return this.unlocked; }

  unlock(): void {
    if (typeof Audio === 'undefined') return;
    this.unlocked = true;
    void resourceManager.init().then(() => this.sync());
  }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_MUSIC_VOLUME;
    this.sync();
  }

  setMuted(value: boolean): void { this.muted = value; this.sync(); }

  sync(): void {
    if (!this.unlocked) return;
    const next = resourceManager.get('sound/bgm');
    if (!next || this.muted || this.volume === 0) { this.audio?.pause(); return; }
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.loop = true;
      this.audio.preload = 'none';
      this.audio.hidden = true;
      this.audio.dataset.sgsMusic = 'true';
      document.body.appendChild(this.audio);
    }
    this.audio.volume = this.volume * MUSIC_OUTPUT_GAIN;
    if (this.url !== next) {
      this.audio.pause();
      this.audio.src = next;
      this.url = next;
    }
    if (this.audio.paused) void this.audio.play().catch(() => { /* retry on next gesture */ });
  }

  dispose(): void {
    this.audio?.pause();
    this.audio?.remove();
    this.audio = null;
    this.url = null;
    this.unlocked = false;
  }
}
export const musicEngine = new MusicEngine();
if (import.meta.hot) import.meta.hot.dispose(() => musicEngine.dispose());

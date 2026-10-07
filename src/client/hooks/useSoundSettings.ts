import { useEffect, useSyncExternalStore } from 'react';
import { audioEngine } from '../sounds/audioEngine';
import { musicEngine } from '../sounds/musicEngine';
import { DEFAULT_MUSIC_VOLUME } from '../sounds/musicLevels';

const STORAGE_KEY = 'sgs:sound';
export interface SoundSettings { muted: boolean; volume: number; musicMuted: boolean; musicVolume: number }
const DEFAULT_SETTINGS: SoundSettings = { muted: false, volume: 1, musicMuted: false, musicVolume: DEFAULT_MUSIC_VOLUME };
const listeners = new Set<() => void>();
let snapshot: SoundSettings | undefined;
function level(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}
function loadSettings(): SoundSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<SoundSettings>;
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : false,
      volume: level(parsed.volume, 1),
      musicMuted: typeof parsed.musicMuted === 'boolean' ? parsed.musicMuted : false,
      musicVolume: level(parsed.musicVolume, DEFAULT_MUSIC_VOLUME),
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function getSnapshot(): SoundSettings {
  snapshot ??= loadSettings();
  return snapshot;
}
function apply(settings: SoundSettings): void {
  audioEngine.setMuted(settings.muted);
  audioEngine.setVolume(settings.volume);
  musicEngine.setMuted(settings.musicMuted);
  musicEngine.setVolume(settings.musicVolume);
}
function update(changes: Partial<SoundSettings>): void {
  snapshot = { ...getSnapshot(), ...changes };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* private mode */ }
  apply(snapshot);
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useSoundSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_SETTINGS);
  useEffect(() => {
    apply(getSnapshot());
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      snapshot = loadSettings(); apply(snapshot);
      for (const listener of listeners) listener();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return {
    ...settings,
    setMuted: (muted: boolean) => update({ muted }),
    setVolume: (volume: number) => update({ volume: level(volume, 1) }),
    toggleMute: () => update({ muted: !getSnapshot().muted }),
    setMusicVolume: (volume: number) => update({ musicVolume: level(volume, DEFAULT_MUSIC_VOLUME) }),
    toggleMusicMute: () => update({ musicMuted: !getSnapshot().musicMuted }),
  };
}

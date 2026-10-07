// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSoundSettings } from '../../src/client/hooks/useSoundSettings';
import { audioEngine } from '../../src/client/sounds/audioEngine';
import { musicEngine } from '../../src/client/sounds/musicEngine';

describe('independent music and effect settings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(audioEngine, 'setVolume').mockImplementation(() => {});
    vi.spyOn(audioEngine, 'setMuted').mockImplementation(() => {});
    vi.spyOn(musicEngine, 'setVolume').mockImplementation(() => {});
    vi.spyOn(musicEngine, 'setMuted').mockImplementation(() => {});
  });
  it('synchronizes two controls and persists separate volumes without overwriting', () => {
    const a = renderHook(useSoundSettings), b = renderHook(useSoundSettings);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'sgs:sound' })));
    act(() => a.result.current.setMusicVolume(0.25));
    act(() => b.result.current.setVolume(0.65));
    expect(a.result.current.musicVolume).toBe(0.25); expect(a.result.current.volume).toBe(0.65);
    expect(b.result.current.musicVolume).toBe(0.25);
    expect(JSON.parse(localStorage.getItem('sgs:sound')!)).toMatchObject({ musicVolume: 0.25, volume: 0.65 });
  });
  it('muting music does not mute effects, and muting effects does not change music volume', () => {
    const a = renderHook(useSoundSettings);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'sgs:sound' })));
    act(() => a.result.current.toggleMusicMute());
    expect(a.result.current.musicMuted).toBe(true); expect(a.result.current.muted).toBe(false);
    act(() => a.result.current.toggleMute());
    expect(a.result.current.musicVolume).toBe(0.5);
  });
  it('loads legacy effect settings and supplies a quiet music default', () => {
    const a = renderHook(useSoundSettings);
    localStorage.setItem('sgs:sound', JSON.stringify({ muted: true, volume: 0.6 }));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'sgs:sound' })));
    expect(a.result.current).toMatchObject({ muted: true, volume: 0.6, musicMuted: false, musicVolume: 0.5 });
  });
});

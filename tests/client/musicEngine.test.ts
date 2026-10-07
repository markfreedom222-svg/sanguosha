// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicEngine } from '../../src/client/sounds/musicEngine';
import { resourceManager } from '../../src/client/resources';

const elements: HTMLAudioElement[] = [];
describe('background music lifecycle', () => {
  beforeEach(() => {
    elements.length = 0;
    vi.spyOn(resourceManager, 'init').mockResolvedValue();
    vi.spyOn(resourceManager, 'get').mockReturnValue('/packs/base/music.mp3');
    vi.stubGlobal('Audio', function () {
      const audio = document.createElement('audio');
      let paused = true;
      Object.defineProperty(audio, 'paused', { get: () => paused });
      audio.play = vi.fn(async () => { paused = false; });
      audio.pause = vi.fn(() => { paused = true; });
      elements.push(audio);
      return audio;
    });
  });
  it('waits for user interaction and uses one looping, quiet streaming element', async () => {
    const engine = new MusicEngine();
    expect(elements).toHaveLength(0);
    engine.unlock(); await Promise.resolve();
    engine.sync(); expect(elements).toHaveLength(1);
    expect(elements[0].loop).toBe(true); expect(elements[0].volume).toBe(0.2);
    expect(elements[0].preload).toBe('none');
    engine.dispose();
  });
  it('volume updates do not restart the track and music mute pauses independently', async () => {
    const engine = new MusicEngine(); engine.unlock(); await Promise.resolve();
    const audio = elements[0];
    engine.setVolume(0.25); expect(audio.volume).toBe(0.1);
    expect(audio.play).toHaveBeenCalledTimes(1);
    engine.setMuted(true); expect(audio.paused).toBe(true);
    engine.setMuted(false); expect(audio.play).toHaveBeenCalledTimes(2);
    engine.dispose();
  });
  it('disabling the resource pack pauses music and disposal removes the element', async () => {
    const engine = new MusicEngine(); engine.unlock(); await Promise.resolve();
    vi.spyOn(resourceManager, 'get').mockReturnValue(null);
    engine.sync(); expect(elements[0].paused).toBe(true);
    engine.dispose(); expect(elements[0].isConnected).toBe(false);
  });
});

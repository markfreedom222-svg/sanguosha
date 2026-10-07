import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/client/sounds/audioEngine';
import { resourceManager } from '../../src/client/resources';

const starts = vi.fn();
const sources: Array<{ playbackRate: { value: number } }> = [];
const decode = vi.fn();
class FakeContext {
  state = 'running'; currentTime = 0; destination = {};
  createGain() { return { gain: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
  createBufferSource() {
    const source = { buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), disconnect: vi.fn(), start: starts, onended: null };
    sources.push(source); return source;
  }
  decodeAudioData = decode;
  resume() { return Promise.resolve(); }
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
describe('AudioEngine playback guards', () => {
  beforeEach(() => {
    starts.mockClear(); sources.length = 0;
    decode.mockReset().mockResolvedValue({ duration: 0.3 });
    vi.stubGlobal('window', { AudioContext: FakeContext });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
    vi.spyOn(resourceManager, 'get').mockReturnValue('/packs/base/shared.mp3');
  });
  it('shared URLs fetch once and concurrent repeated play requests start once', async () => {
    const engine = new AudioEngine(); engine.unlock();
    engine.preload(['draw', 'flip']); engine.play('draw'); engine.play('flip');
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1); expect(starts).toHaveBeenCalledTimes(1);
  });
  it('card voice keeps original pitch', async () => {
    const engine = new AudioEngine(); engine.unlock(); engine.play('card/杀'); await settle();
    expect(sources[0].playbackRate.value).toBe(1);
  });
  it('does not replay an action after slow download', async () => {
    let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const engine = new AudioEngine(); engine.unlock(); engine.play('draw'); now = 501;
    await settle(); expect(starts).not.toHaveBeenCalled();
  });
  it('muting while loading suppresses pending playback', async () => {
    const engine = new AudioEngine(); engine.unlock(); engine.play('draw'); engine.setMuted(true);
    await settle(); expect(starts).not.toHaveBeenCalled();
  });
  it('changing resource URL loads the new clip instead of reusing stale cache', async () => {
    let url = '/packs/base/one.mp3'; vi.spyOn(resourceManager, 'get').mockImplementation(() => url);
    const engine = new AudioEngine(); engine.unlock(); engine.play('draw'); await settle();
    url = '/packs/base/two.mp3'; engine.play('draw'); await settle();
    expect(fetch).toHaveBeenCalledTimes(2); expect(starts).toHaveBeenCalledTimes(2);
  });
});

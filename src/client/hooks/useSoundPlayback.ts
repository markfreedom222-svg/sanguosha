// Sound follows ingested events: silent turn/phase transitions, action-specific clips,
// and a serial action queue spaced by decoded duration in milliseconds.
import { useEffect, useRef, useCallback } from 'react';
import type { ViewEvent } from '../../engine/types';
import { getAtomDef } from '../../engine/core/atom';
import { audioEngine } from '../sounds/audioEngine';
import type { QueuedEvent } from './useEventPlayback';
import { soundCue } from '../sounds/soundPolicy';

/** ViewEvent 自带的 effect 片段(移动牌等派生事件携带;静态 atom 走 getAtomDef) */
type EventEffect = { sound?: string; volume?: number } | undefined;

/** 氛围音效:回合/阶段切换,fire-and-forget 不串行(不阻塞牌操作) */
/** 动作音效串行间隔(ms):基于音频时长 *0.7,夹在此区间内 */
const MIN_ACTION_GAP_MS = 200;
const MAX_ACTION_GAP_MS = 700;
/** 音频时长未知时的默认间隔(首次播放 buffer 尚未加载) */
const DEFAULT_ACTION_GAP_MS = 350;

/**
 * 从 ViewEvent 提取 effect.sound / effect.volume。
 * 优先用 ViewEvent 自带 effect(派生事件),fallback 到 atom 静态 effect。
 * 查表失败(未注册 type)返回 null,不抛。
 */
function extractSound(event: ViewEvent): { sound: string; volume?: number } | null {
  const atomType = (event as { atomType?: string }).atomType ?? event.type;
  let staticEffect: EventEffect;
  try {
    staticEffect = getAtomDef(atomType).effect;
  } catch {
    staticEffect = undefined;
  }
  const effect = (event.effect as EventEffect) ?? staticEffect;
  if (!effect?.sound) return null;
  return soundCue(effect.sound, atomType, effect.volume);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 音效播放 hook。监听 ingested 立即批次,与视觉动作同帧响应。
 *
 * 回合/阶段切换静音，动作音效按实际时长串行播放。
 *
 * @param ingested  事件批次(来自 useEventPlayback.ingested 或 connection hook 的 ingestedEvents)。
 *                  null/undefined/空数组时无副作用。
 */
export function useSoundPlayback(ingested: readonly QueuedEvent[] | null | undefined): void {
  const lastSeqRef = useRef(0);
  const actionQueueRef = useRef<{ sound: string; volume?: number }[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 串行出队:逐个播放动作音效,间隔基于音频实际时长(留尾部重叠做过渡)。
   *  用 timerRef.current !== null 判断是否在播放(StrictMode 安全:cleanup 清 timer 即解锁)。 */
  const drain = useCallback(() => {
    if (timerRef.current !== null) return;
    const item = actionQueueRef.current.shift();
    if (!item) return;
    audioEngine.play(item.sound, item.volume);
    const dur = audioEngine.getDuration(item.sound);
    const gap = clamp(
      dur != null ? dur * 1000 * 0.7 : DEFAULT_ACTION_GAP_MS,
      MIN_ACTION_GAP_MS,
      MAX_ACTION_GAP_MS,
    );
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      drain();
    }, gap);
  }, []);

  useEffect(() => {
    if (ingested && ingested.length > 0) {
      const fresh = ingested.filter((e) => e.seq > lastSeqRef.current);
      if (fresh.length > 0) {
        lastSeqRef.current = Math.max(...fresh.map((e) => e.seq));
        for (const { event } of fresh) {
          const s = extractSound(event);
          if (!s) continue;
          actionQueueRef.current.push(s);
        }
      }
    }
    // 总是尝试出队:StrictMode remount 时 fresh 为空但队列可能有余项,
    // timer 已被 cleanup 清除(null)→ 可正常出队。
    drain();
  }, [ingested, drain]);

  // 卸载/StrictMode cleanup:清 timer 即同时解锁 drain(timerRef=null)
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
}

// User gestures unlock effects and looping music; later gestures retry blocked music.
import { useEffect } from 'react';
import { audioEngine } from '../sounds/audioEngine';
import { musicEngine } from '../sounds/musicEngine';

/** 触发解锁的事件类型(覆盖鼠标/键盘/触摸) */
const UNLOCK_EVENTS: Array<keyof DocumentEventMap> = ['click', 'keydown', 'touchstart'];

/**
 * 解锁后预加载的高频音效。这些音效在游戏中触发最频繁、对延迟最敏感(摸牌每回合多次、
 * 出杀/闪避为最常见攻防),预加载消除首次播放的 fetch+解码延迟。fire-and-forget,不阻塞首帧。
 */
const PRELOAD_SOUNDS = [
  'flip', // 摸牌/弃牌/获得/判定(最高频)
  'draw',
  'discard',
  'judge',
  'card/杀', // 出杀(最常见攻击)
  'card/闪', // 闪避(最常见响应)
  'card/桃', // 桃(回复/救人)
  'card/无中生有', // 常见摸牌锦囊
  'heal', // 回复体力
] as const;

/**
 * 注册一次性自动播放解锁监听器。
 * 应在应用最顶层(App)调用,确保全局只注册一次。
 */
export function useAudioUnlock(): void {
  useEffect(() => {
    // 已经解锁(如 SSR hydration 后已有交互):无需注册
    const handler = () => {
      if (audioEngine.isUnlocked() && musicEngine.isUnlocked()) {
        musicEngine.sync();
        return;
      }
      audioEngine.unlock();
      musicEngine.unlock();
      // 预热高频音效:首次摸牌/出杀等无延迟(文件缺失会静默负缓存,无副作用)
      audioEngine.preload(PRELOAD_SOUNDS);
      // Keep listening so music rejected by autoplay can retry on a later gesture.
    };

    // capture: true 确保在目标元素之前捕获,尽早解锁
    for (const evt of UNLOCK_EVENTS) {
      document.addEventListener(evt, handler, true);
    }

    return () => {
      for (const evt of UNLOCK_EVENTS) {
        document.removeEventListener(evt, handler, true);
      }
    };
  }, []);
}

import { useState } from 'react';
import { css } from '@linaria/core';
import { useSoundSettings } from '../hooks/useSoundSettings';

const wrap = css`position: relative; display: inline-flex; color: #eee; font-size: 13px;`;
const button = css`background: #202a3e; color: #eee; border: 1px solid #667085; border-radius: 6px; padding: 6px 9px; cursor: pointer;`;
const panel = css`
  position: absolute; top: 100%; right: 0; z-index: 100; min-width: 250px;
  margin-top: 8px; padding: 14px; background: #182235; border: 1px solid #667085;
  border-radius: 10px; box-shadow: 0 8px 24px #0008;
`;
const row = css`display: flex; align-items: center; gap: 8px; margin: 10px 0;`;
const slider = css`width: 120px; accent-color: #dfb25f;`;

export function SoundControl() {
  const settings = useSoundSettings();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={wrap}>
      <button className={button} onClick={() => setExpanded(!expanded)} aria-label="声音设置" aria-expanded={expanded}>🎵 声音</button>
      {expanded && <div className={panel} role="group" aria-label="声音设置面板">
        <div>背景音乐</div>
        <div className={row}>
          <input className={slider} type="range" min={0} max={1} step={0.01} value={settings.musicVolume} onChange={(e) => settings.setMusicVolume(Number(e.target.value))} aria-label="背景音乐音量" />
          <span>{Math.round(settings.musicVolume * 100)}%</span>
          <button className={button} onClick={settings.toggleMusicMute} aria-label={settings.musicMuted ? '开启背景音乐' : '静音背景音乐'} aria-pressed={settings.musicMuted}>{settings.musicMuted ? '开启' : '静音'}</button>
        </div>
        <div>游戏音效</div>
        <div className={row}>
          <input className={slider} type="range" min={0} max={1} step={0.01} value={settings.volume} onChange={(e) => settings.setVolume(Number(e.target.value))} aria-label="音效音量" />
          <span>{Math.round(settings.volume * 100)}%</span>
          <button className={button} onClick={settings.toggleMute} aria-label={settings.muted ? '开启游戏音效' : '静音游戏音效'} aria-pressed={settings.muted}>{settings.muted ? '开启' : '静音'}</button>
        </div>
      </div>}
    </div>
  );
}

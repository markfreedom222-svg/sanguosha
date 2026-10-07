// Independently implemented after studying noname's action feedback and repeat guard.
const SILENT_TRANSITIONS = new Set(['turn_start', 'turn_end', 'phase_start', 'phase_end']);
const ACTION_SOUNDS: Record<string, string> = { 摸牌: 'draw', 弃置: 'discard', 判定: 'judge' };

export function soundCue(sound: string, atomType: string, volume?: number): { sound: string; volume?: number } | null {
  if (SILENT_TRANSITIONS.has(sound)) return null;
  const mapped = sound === 'flip' ? ACTION_SOUNDS[atomType] ?? sound : sound;
  const level = mapped.startsWith('card/') || mapped.startsWith('death/') ? 0.8
    : mapped.startsWith('injure_') ? 0.65
      : mapped.startsWith('equip/') ? 0.5 : 0.4;
  return { sound: mapped, volume: volume ?? level };
}

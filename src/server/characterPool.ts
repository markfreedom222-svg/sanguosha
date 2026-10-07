import { allCharacters, weiCharacters, shuCharacters, wuCharacters, qunCharacters } from '../engine/data/characters';

/** 只有全武将预设包含界武将；标准池先过滤，再取各势力前八名。 */
export function resolveCharPool(preset: string): Array<{ name: string; skills: string[] }> {
  const regular = (characters: typeof allCharacters) => characters.filter((c) => !c.name.startsWith('界'));
  const characters = preset === 'all' ? allCharacters : preset === 'standard'
    ? [weiCharacters, shuCharacters, wuCharacters, qunCharacters].flatMap((faction) => regular(faction).slice(0, 8))
    : regular(allCharacters);
  return characters.map((c) => ({ name: c.name, skills: c.skills.map((skill) => skill.name) }));
}

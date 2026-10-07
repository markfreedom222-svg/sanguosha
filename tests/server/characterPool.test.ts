import { describe, expect, it } from 'vitest';
import { resolveCharPool } from '../../src/server/characterPool';
import { allCharacters, weiCharacters, shuCharacters, wuCharacters, qunCharacters } from '../../src/engine/data/characters';

describe('character pool presets', () => {
  it('standard takes eight regular characters per faction, filtering before slicing', () => {
    const expected = [weiCharacters, shuCharacters, wuCharacters, qunCharacters]
      .flatMap((faction) => faction.filter((c) => !c.name.startsWith('界')).slice(0, 8)).map((c) => c.name);
    expect(resolveCharPool('standard').map((c) => c.name)).toEqual(expected);
    expect(expected).toHaveLength(32);
  });
  it('extended and unknown presets exclude all boundary characters', () => {
    for (const preset of ['extended', 'unknown']) {
      const pool = resolveCharPool(preset);
      expect(pool.map((c) => c.name)).toEqual(allCharacters.filter((c) => !c.name.startsWith('界')).map((c) => c.name));
    }
  });
  it('all retains every character and its skill names', () => {
    expect(resolveCharPool('all')).toEqual(allCharacters.map((c) => ({ name: c.name, skills: c.skills.map((s) => s.name) })));
    expect(resolveCharPool('all').some((c) => c.name.startsWith('界'))).toBe(true);
  });
});

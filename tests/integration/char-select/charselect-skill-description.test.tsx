// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CharSelectOverlay, type CharSelectOverlayCandidate } from '../../../src/client/components/CharSelectOverlay';
import { getSkillDescription, setSkillModuleOverride } from '../../../src/engine/skills/lifecycle';

afterEach(cleanup);

function setup(candidates: CharSelectOverlayCandidate[], isSelfSelecting = true) {
  const onSelect = vi.fn();
  render(
<CharSelectOverlay
    candidates={candidates}
    charSelectTarget={0}
    isSelfSelecting={isSelfSelecting}
    isLord={true}
    viewer={0}
    deadline={null}
    totalMs={30000}
    onSelect={onSelect}
    getCharacterMeta={() => ({ faction: '蜀', maxHealth: 4 })}
  />
);
  return onSelect;
}

function registerDescription(id: string, description: string) {
  const loader = vi.fn(async () => ({
    createSkill: (skillId: string, ownerId: number) => ({ id: skillId, ownerId, name: id, description }),
  }));
  setSkillModuleOverride(id, loader);
  return loader;
}

describe('选将技能介绍', () => {
  it('首次进入即加载候选技能，点击查看说明后仍须确认才提交', async () => {
    const id = '选将冷加载技能';
    const description = '出牌阶段，你可以将一张手牌交给另一名角色。';
    const loader = registerDescription(id, description);
    expect(getSkillDescription(id)).toBeUndefined();
    const onSelect = setup([{ name: '测试武将', skills: [id] }]);
    await waitFor(() => expect(getSkillDescription(id)).toBe(description));
    expect(loader).toHaveBeenCalledTimes(1);
    const skillChip = screen.getByText(id);
    fireEvent.mouseEnter(skillChip);
    expect(screen.getByText(description)).toBeDefined();
    fireEvent.mouseLeave(skillChip);
    fireEvent.click(screen.getByText('测试武将'));
    const details = screen.getByRole('region', { name: '武将技能介绍' });
    expect(within(details).getByText(description)).toBeDefined();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认选择' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('测试武将');
    expect(within(details).getByText(description)).toBeDefined();
  });

  it('点击展开标界版本，切换版本显示对应技能说明', async () => {
    registerDescription('选将标准版技能', '标准版技能说明。');
    registerDescription('选将界版技能', '界版技能说明。');
    const onSelect = setup([
      { name: '测试版本武将', baseId: '测试版本武将', skills: ['选将标准版技能'] },
      { name: '界测试版本武将', baseId: '测试版本武将', skills: ['选将界版技能'] },
    ]);
    fireEvent.click(screen.getByText('测试版本武将'));
    const details = screen.getByRole('region', { name: '武将技能介绍' });
    await waitFor(() => expect(within(details).getByText('标准版技能说明。')).toBeDefined());
    fireEvent.click(screen.getByText('界测试版本武将'));
    expect(within(details).getByText('界测试版本武将 · 技能介绍')).toBeDefined();
    expect(within(details).getByText('界版技能说明。')).toBeDefined();
    expect(within(details).queryByText('标准版技能说明。')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认选择' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('界测试版本武将');
  });

  it('技能模块缺失时给出明确提示，结束加载状态', async () => {
    setup([{ name: '缺失技能武将', skills: ['未声明的选将测试技能'] }]);
    fireEvent.click(screen.getByText('缺失技能武将'));
    await waitFor(() => expect(screen.getByText('暂无技能说明')).toBeDefined());
    expect(screen.queryByText('正在加载技能说明…')).toBeNull();
  });

  it('鼠标移入其他武将不会改变布局，连续点击多个武将都更新技能介绍', async () => {
    registerDescription('连续点击甲技能', '甲的技能说明');
    registerDescription('连续点击乙技能', '乙的技能说明');
    registerDescription('连续点击界乙技能', '界乙的技能说明');
    const onSelect = setup([
      { name: '候选甲', skills: ['连续点击甲技能'] },
      { name: '候选乙', baseId: '候选乙', skills: ['连续点击乙技能'] },
      { name: '界候选乙', baseId: '候选乙', skills: ['连续点击界乙技能'] },
    ]);
    fireEvent.click(screen.getByText('候选甲'));
    const details = within(screen.getByRole('region', { name: '武将技能介绍' }));
    await waitFor(() => expect(details.getByText('甲的技能说明')).toBeDefined());
    const secondCard = screen.getByText('候选乙').closest('[data-multi-group]')!;
    fireEvent.mouseEnter(secondCard);
    expect(screen.queryByText('界候选乙')).toBeNull();
    fireEvent.click(secondCard);
    expect(details.getByText('乙的技能说明')).toBeDefined();
    fireEvent.mouseLeave(secondCard);
    expect(screen.getByText('界候选乙')).toBeDefined();
    fireEvent.click(screen.getByText('界候选乙'));
    expect(details.getByText('界乙的技能说明')).toBeDefined();
    fireEvent.click(screen.getByText('候选甲'));
    expect(details.getByText('甲的技能说明')).toBeDefined();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('等待他人选将时不加载或显示候选技能', () => {
    const loader = registerDescription('他人选将秘密技能', '秘密技能说明。');
    setup([{ name: '秘密候选武将', skills: ['他人选将秘密技能'] }], false);
    expect(loader).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: '武将技能介绍' })).toBeNull();
    expect(screen.queryByText('秘密候选武将')).toBeNull();
  });
});

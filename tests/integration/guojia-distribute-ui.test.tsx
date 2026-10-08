// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameViewComponent } from '../../src/client/components/GameView';
import { makeGuojiaDistributeView } from '../fixtures/guojia-distribute-view';

async function setup(boundary = false) {
  const onAction = vi.fn();
  await act(async () => {
    render(<GameViewComponent view={makeGuojiaDistributeView(boundary)} onAction={onAction} />);
  });
  return { onAction, picker: within(screen.getByRole('region', { name: '技能选牌与分配' })) };
}

describe('郭嘉遗计选牌与分配', () => {
  it('牌堆顶的杀牌在独立面板可选，两张全分配后才能提交，允许留给自己', async () => {
    const { picker, onAction } = await setup();
    fireEvent.click(picker.getByRole('button', { name: '杀 ♠7' }));
    fireEvent.click(picker.getByRole('button', { name: '分给 测试玩家（自己）' }));
    expect(picker.getByText('→ 测试玩家（自己）')).toBeDefined();
    expect(screen.getByRole('button', { name: /提交分配\(1\)/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /提交分配\(1\)/ }));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(picker.getByRole('button', { name: '闪 ♥2' }));
    fireEvent.click(picker.getByRole('button', { name: '分给 好友' }));
    fireEvent.click(screen.getByRole('button', { name: /提交分配\(2\)/ }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({
      skillId: '遗计', actionType: 'respond', ownerId: 0,
      params: { allocation: [{ target: 0, cardIds: ['g-kill'] }, { target: 1, cardIds: ['g-dodge'] }] },
    });
  });

  it('标准遗计可主动选择不发动，无需等待倒计时', async () => {
    const { picker, onAction } = await setup();
    fireEvent.click(picker.getByRole('button', { name: '不发动' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ skillId: '遗计', actionType: 'respond', ownerId: 0, params: { allocation: [] } });
  });

  it('界遗计可以从手牌选牌送给其他人，并可取消交牌', async () => {
    const { picker, onAction } = await setup(true);
    expect(picker.queryByRole('button', { name: /分给.*自己/ })).toBeNull();
    fireEvent.click(picker.getByRole('button', { name: '杀 ♠7' }));
    fireEvent.click(picker.getByRole('button', { name: '分给 好友' }));
    fireEvent.click(screen.getByRole('button', { name: /提交分配\(1\)/ }));
    expect(onAction).toHaveBeenLastCalledWith({ skillId: '界遗计', actionType: 'respond', ownerId: 0, params: { allocation: [{ target: 1, cardIds: ['g-kill'] }] } });
    fireEvent.click(picker.getByRole('button', { name: '取消交牌' }));
    expect(onAction).toHaveBeenLastCalledWith({ skillId: '界遗计', actionType: 'respond', ownerId: 0, params: { allocation: [] } });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { HeadlessGameClient } from '../../src/client/headless/HeadlessGameClient';
import type { ChatEntry } from '../../src/server/protocol';

describe('chat identity transport', () => {
  it('retains the same sender snapshot in live and reconnect callbacks', () => {
    const onChat = vi.fn();
    const client = new HeadlessGameClient('http://127.0.0.1:9528', { onChat });
    const receiver = client as unknown as { handleRaw: (raw: string) => void };
    const message: ChatEntry = { playerId: 'alice', seatIndex: 1, username: 'alice', character: '刘备', text: 'hi', timestamp: 1 };
    receiver.handleRaw(JSON.stringify({ type: 'chat', ...message }));
    expect(onChat).toHaveBeenLastCalledWith([message], 'chat');
    receiver.handleRaw(JSON.stringify({ type: 'chat_history', messages: [message] }));
    expect(onChat).toHaveBeenLastCalledWith([message], 'history');
  });
});

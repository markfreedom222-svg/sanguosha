import { describe, expect, it } from 'vitest';
import { formatChatSender } from '../../src/client/utils/chatSender';

describe('chat sender label', () => {
  const message = { playerId: 'u1', seatIndex: 1, text: 'hi', timestamp: 1 };
  it('shows the recorded username and hero instead of looking up another player', () => {
    expect(formatChatSender({ ...message, username: 'alice', character: '刘备' })).toBe('alice（刘备）');
  });
  it('does not invent a hero while selecting characters or reading a legacy message', () => {
    expect(formatChatSender({ ...message, username: 'alice', character: '' })).toBe('alice');
    expect(formatChatSender(message)).toBe('P2');
  });
});

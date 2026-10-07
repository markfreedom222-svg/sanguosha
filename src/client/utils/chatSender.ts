import type { ChatMessage } from '../headless/types';

/** 使用消息发送时的身份快照，旧消息不再用物理座位猜测英雄。 */
export function formatChatSender(message: ChatMessage): string {
  const username = message.username ?? `P${message.seatIndex + 1}`;
  return message.character ? `${username}（${message.character}）` : username;
}

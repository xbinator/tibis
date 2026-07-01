/**
 * @file context-overflow.test.ts
 * @description ChatRuntime 上下文超限辅助函数测试。
 */
import type { AIServiceError } from 'types/ai';
import type { ChatMessageRecord } from 'types/chat';
import { describe, expect, it } from 'vitest';
import {
  downgradeOverflowReplaySourceMessages,
  downgradeUserMessageForOverflowReplay,
  isContextOverflowError
} from '../../../../../../electron/main/modules/chat/runtime/context/overflow.mjs';

/**
 * 创建包含图片附件的用户消息。
 * @returns 用户消息
 */
function createUserMessageWithImage(): ChatMessageRecord {
  return {
    id: 'user-1',
    sessionId: 'session-1',
    role: 'user',
    content: '请看图',
    parts: [{ id: 'part0059', type: 'text', text: '请看图' }],
    files: [{ id: 'file-1', name: 'chart.png', type: 'image', mimeType: 'image/png', url: 'https://example.com/chart.png' }],
    createdAt: '2026-06-19T00:00:00.000Z',
    finished: true
  };
}

describe('chat runtime context overflow helpers', () => {
  it('detects provider context overflow errors', (): void => {
    const error = { code: 'REQUEST_FAILED', message: 'maximum context length exceeded (413)' } as AIServiceError;

    expect(isContextOverflowError(error)).toBe(true);
  });

  it('downgrades media attachments to text placeholders for overflow replay', (): void => {
    const userMessage = createUserMessageWithImage();

    const downgradedMessage = downgradeUserMessageForOverflowReplay(userMessage);

    expect(downgradedMessage.content).toContain('[Attached image/png: chart.png]');
    expect(downgradedMessage.parts).toEqual([expect.objectContaining({ type: 'text', text: downgradedMessage.content })]);
    expect(downgradedMessage.files?.[0]).not.toHaveProperty('url');
  });

  it('replaces only the current user message in replay source messages', (): void => {
    const userMessage = createUserMessageWithImage();
    const assistantMessage: ChatMessageRecord = {
      id: 'assistant-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: 'ok',
      parts: [{ id: 'part0060', type: 'text', text: 'ok' }],
      createdAt: '2026-06-19T00:00:01.000Z',
      finished: true
    };

    const replayMessages = downgradeOverflowReplaySourceMessages([userMessage, assistantMessage], userMessage);

    expect(replayMessages[0].files?.[0]).not.toHaveProperty('url');
    expect(replayMessages[1]).toBe(assistantMessage);
  });
});

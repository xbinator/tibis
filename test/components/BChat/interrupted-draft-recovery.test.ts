/**
 * @file interrupted-draft-recovery.test.ts
 * @description BChat 硬中断 assistant 草稿恢复测试。
 */
import { describe, expect, it } from 'vitest';
import { recoverInterruptedAssistantDrafts, HARD_INTERRUPTED_ASSISTANT_MESSAGE } from '@/components/BChat/utils/interruptedDraftRecovery';
import type { Message } from '@/components/BChat/utils/types';

/**
 * 创建一条未完成的助手草稿消息。
 * @returns 未完成助手消息。
 */
function createInterruptedAssistantDraft(): Message {
  return {
    id: 'assistant-draft-1',
    role: 'assistant',
    content: '已经生成的半截内容',
    parts: [
      { type: 'text', text: '已经生成的半截内容' },
      { type: 'tool', toolCallId: 'tool-1', toolName: 'read_file', status: 'executing', input: { path: 'README.md' } }
    ],
    createdAt: '2026-06-13T00:00:00.000Z',
    loading: true,
    finished: false
  };
}

describe('interrupted assistant draft recovery', () => {
  it('finalizes unfinished assistant drafts and marks running tools as cancelled', (): void => {
    const sourceMessages = [createInterruptedAssistantDraft()];
    const result = recoverInterruptedAssistantDrafts(sourceMessages);
    const recoveredMessage = result.messages[0];
    const toolPart = recoveredMessage.parts.find((part) => part.type === 'tool');

    expect(result.recovered).toBe(true);
    expect(recoveredMessage.loading).toBe(false);
    expect(recoveredMessage.finished).toBe(true);
    expect(recoveredMessage.content).toContain('已经生成的半截内容');
    expect(recoveredMessage.content).toContain(HARD_INTERRUPTED_ASSISTANT_MESSAGE);
    expect(recoveredMessage.parts.at(-1)).toEqual({ type: 'error', text: HARD_INTERRUPTED_ASSISTANT_MESSAGE });
    expect(toolPart).toMatchObject({
      type: 'tool',
      status: 'done',
      result: {
        status: 'cancelled',
        error: { code: 'USER_CANCELLED' }
      }
    });
  });
});

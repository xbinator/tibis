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

/**
 * 创建一条等待用户选择的助手消息。
 * @returns 等待用户选择的助手消息。
 */
function createAwaitingUserChoiceAssistantMessage(): Message {
  return {
    id: 'assistant-awaiting-choice-1',
    role: 'assistant',
    content: '',
    parts: [
      {
        type: 'tool',
        toolCallId: 'question-tool-1',
        toolName: 'ask_user_question',
        status: 'done',
        input: { question: '继续吗？' },
        result: {
          toolName: 'ask_user_question',
          status: 'awaiting_user_input',
          data: {
            questionId: 'question-1',
            toolCallId: 'question-tool-1',
            mode: 'single',
            question: '继续吗？',
            options: [{ label: '继续', value: 'continue' }]
          }
        }
      }
    ],
    createdAt: '2026-06-13T00:00:00.000Z',
    loading: false,
    finished: false
  };
}

describe('interrupted assistant draft recovery', () => {
  it('finalizes unfinished assistant drafts and marks running tools as cancelled', (): void => {
    const sourceMessages = [createInterruptedAssistantDraft()];
    const result = recoverInterruptedAssistantDrafts(sourceMessages);
    const recoveredMessage = result.messages[0];
    const interruptMessage = result.messages[1];
    const toolPart = recoveredMessage.parts.find((part) => part.type === 'tool');

    expect(result.recovered).toBe(true);
    expect(recoveredMessage.role).toBe('assistant');
    expect(recoveredMessage.loading).toBe(false);
    expect(recoveredMessage.finished).toBe(true);
    expect(recoveredMessage.content).toContain('已经生成的半截内容');
    expect(recoveredMessage.content).not.toContain(HARD_INTERRUPTED_ASSISTANT_MESSAGE);
    expect(interruptMessage).toMatchObject({
      id: 'assistant-draft-1-interrupt',
      role: 'interrupt',
      content: HARD_INTERRUPTED_ASSISTANT_MESSAGE,
      parts: [],
      loading: false,
      finished: true
    });
    expect(result.createdMessages).toEqual([interruptMessage]);
    expect(toolPart).toMatchObject({
      type: 'tool',
      status: 'done',
      result: {
        status: 'cancelled',
        error: { code: 'USER_CANCELLED' }
      }
    });
  });

  it('keeps assistant messages that are waiting for user choice', (): void => {
    const awaitingMessage = createAwaitingUserChoiceAssistantMessage();
    const result = recoverInterruptedAssistantDrafts([awaitingMessage]);

    expect(result.recovered).toBe(false);
    expect(result.messages[0]).toEqual(awaitingMessage);
  });

  it('does not create duplicate interrupt messages for an already recovered draft', (): void => {
    const sourceMessages = recoverInterruptedAssistantDrafts([createInterruptedAssistantDraft()]).messages;
    const result = recoverInterruptedAssistantDrafts(sourceMessages);

    expect(result.recovered).toBe(false);
    expect(result.createdMessages).toEqual([]);
    expect(result.messages.filter((message) => message.role === 'interrupt')).toHaveLength(1);
    expect(result.messages.map((message) => message.id)).toEqual(['assistant-draft-1', 'assistant-draft-1-interrupt']);
  });
});

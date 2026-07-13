/**
 * @file pending-interaction.test.ts
 * @description 持久化聊天交互恢复策略测试。
 */
import type { ChatMessagePart } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { findPendingInteraction } from '@/ai/chat/policies/pendingInteraction';

/** 创建待回答 Question 工具片段。 */
function createPendingQuestionPart(): ChatMessagePart {
  return {
    id: 'part-question',
    type: 'tool',
    toolCallId: 'tool-call-question',
    toolName: 'question',
    status: 'done',
    input: { question: '继续吗？' },
    result: {
      toolName: 'question',
      status: 'awaiting_user_input',
      data: {
        questionId: 'question-1',
        toolCallId: 'tool-call-question',
        question: '继续吗？',
        mode: 'single',
        options: [{ label: '继续', value: 'yes' }]
      }
    }
  };
}

describe('pending interaction policy', (): void => {
  it('restores the latest pending user choice from persisted messages', (): void => {
    const interaction = findPendingInteraction(
      [
        {
          id: 'assistant-question',
          parts: [createPendingQuestionPart()],
          runtimeId: 'runtime-question',
          agentId: 'researcher'
        }
      ],
      'session-1'
    );

    expect(interaction).toEqual({
      type: 'userChoice',
      status: 'pending',
      sessionId: 'session-1',
      messageId: 'assistant-question',
      runtimeId: 'runtime-question',
      agentId: 'researcher',
      toolCallId: 'tool-call-question',
      questionId: 'question-1'
    });
  });

  it('creates a stable recovery Runtime ID when old messages have no Runtime metadata', (): void => {
    const interaction = findPendingInteraction([{ id: 'assistant-legacy', parts: [createPendingQuestionPart()] }], 'session-1');

    expect(interaction?.runtimeId).toBe('persisted-interaction:assistant-legacy:tool-call-question');
    expect(interaction?.agentId).toBe('primary');
  });
});

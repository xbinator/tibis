/**
 * @file boundary.test.ts
 * @description 上下文压缩 immutable boundary 规划测试。
 */
import type { ChatMessagePart, ChatMessageRecord } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { findSafeBoundary } from '../../../../../../../electron/main/modules/chat/runtime/compaction/boundary.mjs';

/**
 * 创建边界测试消息。
 * @param id - 消息标识
 * @param role - 消息角色
 * @param parts - 消息 Part
 * @param finished - 消息是否完成
 * @returns 聊天消息
 */
function createMessage(id: string, role: ChatMessageRecord['role'], parts: ChatMessagePart[], finished: boolean): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-1',
    role,
    content: '',
    parts,
    createdAt: `2026-07-16T00:00:0${id.length}.000Z`,
    loading: !finished,
    finished
  };
}

describe('compaction boundary', (): void => {
  it('boundary 不会越过当前触发用户消息', (): void => {
    const messages = [
      createMessage('assistant-old', 'assistant', [{ id: 'previous-immutable-part', type: 'text', text: '旧结论' }], true),
      createMessage('user-current', 'user', [{ id: 'current-user-part', type: 'text', text: '继续长任务' }], true)
    ];

    expect(findSafeBoundary(messages, { currentUserMessageId: 'user-current' })).toEqual({
      messageId: 'assistant-old',
      messageIndex: 0,
      partId: 'previous-immutable-part',
      partIndex: 0
    });
  });

  it.each([
    {
      label: 'tool inputting',
      part: { id: 'tool-1', type: 'tool', toolCallId: 'call-1', toolName: 'read_file', status: 'inputting', input: {} } satisfies ChatMessagePart
    },
    {
      label: 'tool executing',
      part: { id: 'tool-2', type: 'tool', toolCallId: 'call-2', toolName: 'read_file', status: 'executing', input: {} } satisfies ChatMessagePart
    },
    {
      label: 'pending confirmation',
      part: {
        id: 'confirmation-1',
        type: 'confirmation',
        confirmationId: 'confirmation-1',
        toolName: 'write_file',
        title: '写入文件',
        description: '是否写入？',
        riskLevel: 'write',
        confirmationStatus: 'pending',
        executionStatus: 'idle'
      } satisfies ChatMessagePart
    },
    {
      label: 'awaiting user choice',
      part: {
        id: 'tool-3',
        type: 'tool',
        toolCallId: 'call-3',
        toolName: 'question',
        status: 'done',
        input: {},
        result: {
          toolName: 'question',
          status: 'awaiting_user_input',
          data: {
            questionId: 'question-1',
            toolCallId: 'call-3',
            mode: 'single',
            question: '选择？',
            options: [{ label: 'A', value: 'A', description: '选 A' }]
          }
        }
      } satisfies ChatMessagePart
    },
    {
      label: 'pending compaction',
      part: {
        id: 'checkpoint-pending',
        type: 'compaction',
        status: 'pending',
        trigger: 'automatic',
        createdAt: 1
      } satisfies ChatMessagePart
    }
  ])('拒绝 $label 状态', ({ part }): void => {
    const messages = [
      createMessage('assistant-old', 'assistant', [{ id: 'old-text', type: 'text', text: '旧内容' }], true),
      createMessage('assistant-active', 'assistant', [part], false)
    ];

    expect(findSafeBoundary(messages, {})).toBeNull();
  });

  it('允许完整持久化的 tool result 成为 active assistant 边界', (): void => {
    const toolPart: ChatMessagePart = {
      id: 'tool-done',
      type: 'tool',
      toolCallId: 'call-done',
      toolName: 'read_file',
      status: 'done',
      input: { path: 'src/a.ts' },
      result: { toolName: 'read_file', status: 'success', data: { content: 'export {}' } }
    };

    expect(findSafeBoundary([createMessage('assistant-active', 'assistant', [toolPart], false)], {})).toEqual({
      messageId: 'assistant-active',
      messageIndex: 0,
      partId: 'tool-done',
      partIndex: 0
    });
  });

  it('拒绝仍在 streaming 的 assistant text', (): void => {
    const messages = [createMessage('assistant-active', 'assistant', [{ id: 'text-streaming', type: 'text', text: '尚未完成' }], false)];

    expect(findSafeBoundary(messages, {})).toBeNull();
  });
});

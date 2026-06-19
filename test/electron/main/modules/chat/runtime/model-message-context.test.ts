/**
 * @file model-message-context.test.ts
 * @description ChatRuntime 主进程模型上下文转换测试。
 */
import type { ChatMessageRecord } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { toRuntimeModelMessages } from '../../../../../../electron/main/modules/chat/runtime/context/model-message.mjs';

/**
 * 创建测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @returns 测试消息
 */
function createMessage(id: string, role: ChatMessageRecord['role'], content: string): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-1',
    role,
    content,
    parts: content ? [{ type: 'text', text: content }] : [],
    createdAt: `2026-06-19T00:00:0${id.length}.000Z`
  };
}

describe('runtime model message context', (): void => {
  it('converts current user message with prior assistant history', (): void => {
    const messages = [
      createMessage('u1', 'user', 'first question'),
      createMessage('a1', 'assistant', 'first answer'),
      createMessage('u2', 'user', 'follow up'),
      createMessage('draft', 'assistant', '')
    ];

    expect(toRuntimeModelMessages(messages)).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
      { role: 'user', content: 'follow up' }
    ]);
  });

  it('falls back to assistant content when legacy messages have no parts', (): void => {
    const assistant = createMessage('legacy-assistant', 'assistant', 'legacy answer');
    assistant.parts = [];

    expect(toRuntimeModelMessages([assistant])).toEqual([{ role: 'assistant', content: [{ type: 'text', text: 'legacy answer' }] }]);
  });

  it('starts from the latest successful compression boundary', (): void => {
    const oldUser = createMessage('u1', 'user', 'old question');
    const covered = createMessage('a1', 'assistant', 'old answer');
    const boundary = createMessage('c1', 'compression', 'compressed');
    boundary.compression = {
      status: 'success',
      recordText: 'COMPRESSED_CONTEXT',
      coveredUntilMessageId: covered.id
    };
    const failedBoundary = createMessage('c2', 'compression', 'failed');
    failedBoundary.compression = {
      status: 'failed',
      recordText: '',
      errorMessage: 'failed'
    };

    expect(toRuntimeModelMessages([oldUser, covered, boundary, failedBoundary, createMessage('u2', 'user', 'new question')])).toEqual([
      { role: 'assistant', content: 'COMPRESSED_CONTEXT' },
      { role: 'user', content: 'new question' }
    ]);
  });

  it('converts completed tool parts into assistant tool calls and tool results', (): void => {
    const assistant = createMessage('a-tool', 'assistant', '');
    assistant.parts = [
      { type: 'text', text: 'I will inspect the file.' },
      {
        type: 'tool',
        toolCallId: 'tool-call-1',
        toolName: 'read_file',
        status: 'done',
        input: { path: 'src/index.ts' },
        result: { toolName: 'read_file', status: 'success', data: { content: 'export const ok = true;' } }
      },
      { type: 'text', text: 'The file exports ok.' }
    ];

    expect(toRuntimeModelMessages([assistant])).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will inspect the file.' },
          { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'src/index.ts' } }
        ]
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-call-1',
            toolName: 'read_file',
            output: { type: 'json', value: { toolName: 'read_file', status: 'success', data: { content: 'export const ok = true;' } } }
          }
        ]
      },
      { role: 'assistant', content: [{ type: 'text', text: 'The file exports ok.' }] }
    ]);
  });
});

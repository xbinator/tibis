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
      { role: 'system', content: 'COMPRESSED_CONTEXT' },
      { role: 'user', content: 'new question' }
    ]);
  });

  it('starts from an automatic assistant compaction part without requiring a separate compression message', (): void => {
    const oldUser = createMessage('u1', 'user', 'old question');
    const covered = createMessage('a1', 'assistant', 'old answer');
    const compactedAssistant = createMessage('a2', 'assistant', '');
    compactedAssistant.parts = [
      {
        type: 'compaction',
        auto: true,
        reason: 'auto',
        status: 'success',
        recordText: 'COMPRESSED_CONTEXT',
        recordId: 'record-1',
        coveredUntilMessageId: covered.id,
        sourceMessageIds: [oldUser.id, covered.id]
      }
    ];
    const nextUser = createMessage('u2', 'user', 'new question');

    expect(toRuntimeModelMessages([oldUser, covered, compactedAssistant, nextUser])).toEqual([
      { role: 'system', content: 'COMPRESSED_CONTEXT' },
      { role: 'user', content: 'new question' }
    ]);
  });

  it('adds a user continuation prompt when automatic compaction covers the active assistant turn', (): void => {
    const currentUser = createMessage('u1', 'user', 'finish the task');
    const activeAssistant = createMessage('a1', 'assistant', '');
    activeAssistant.parts = [
      {
        type: 'tool',
        toolCallId: 'tool-call-1',
        toolName: 'operate_webpage',
        status: 'done',
        input: { index: 9 },
        result: { toolName: 'operate_webpage', status: 'success', data: { clicked: true } }
      },
      {
        type: 'compaction',
        auto: true,
        reason: 'auto',
        status: 'success',
        recordText: 'COMPRESSED_CONTEXT',
        recordId: 'record-1',
        coveredUntilMessageId: activeAssistant.id,
        sourceMessageIds: [currentUser.id, activeAssistant.id]
      }
    ];

    const modelMessages = toRuntimeModelMessages([currentUser, activeAssistant]);

    expect(modelMessages).toEqual([
      { role: 'system', content: 'COMPRESSED_CONTEXT' },
      {
        role: 'user',
        content: expect.stringContaining('继续完成当前用户任务')
      }
    ]);
  });

  it('serializes assistant parts written after an automatic compaction boundary as neutral context before a later user turn', (): void => {
    const oldUser = createMessage('u1', 'user', 'old question');
    const covered = createMessage('a1', 'assistant', 'old answer');
    const compactedAssistant = createMessage('a2', 'assistant', '');
    compactedAssistant.parts = [
      {
        type: 'compaction',
        auto: true,
        reason: 'auto',
        status: 'success',
        recordText: 'COMPRESSED_CONTEXT',
        recordId: 'record-1',
        coveredUntilMessageId: covered.id,
        sourceMessageIds: [oldUser.id, covered.id]
      },
      { type: 'text', text: 'continued answer' }
    ];
    const nextUser = createMessage('u2', 'user', 'new question');

    const modelMessages = toRuntimeModelMessages([oldUser, covered, compactedAssistant, nextUser]);

    expect(modelMessages).toEqual([
      { role: 'system', content: 'COMPRESSED_CONTEXT' },
      { role: 'user', content: expect.stringContaining('continued answer') },
      { role: 'user', content: 'new question' }
    ]);
    expect(modelMessages[1]?.content).not.toContain('继续完成当前用户任务');
  });

  it('serializes post-compaction tool progress as user continuation context', (): void => {
    const oldUser = createMessage('u1', 'user', 'navigate the backend');
    const covered = createMessage('a1', 'assistant', 'clicked menu');
    const compactedAssistant = createMessage('a2', 'assistant', '');
    compactedAssistant.parts = [
      {
        type: 'compaction',
        auto: true,
        reason: 'auto',
        status: 'success',
        recordText: 'COMPRESSED_CONTEXT',
        recordId: 'record-1',
        coveredUntilMessageId: covered.id,
        sourceMessageIds: [oldUser.id, covered.id]
      },
      { type: 'thinking', thinking: 'Let me continue the task.' },
      {
        type: 'tool',
        toolCallId: 'tool-call-read-page',
        toolName: 'read_current_webpage',
        status: 'done',
        input: { include_structure: true },
        result: { toolName: 'read_current_webpage', status: 'success', data: { title: '160云医院-张哥中医理疗馆' } }
      }
    ];

    const modelMessages = toRuntimeModelMessages([oldUser, covered, compactedAssistant]);

    expect(modelMessages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(JSON.stringify(modelMessages)).not.toContain('"role":"tool"');
    expect(modelMessages[1]).toEqual({
      role: 'user',
      content: expect.stringContaining('read_current_webpage')
    });
    expect(modelMessages[1]).toEqual({
      role: 'user',
      content: expect.stringContaining('继续完成当前用户任务')
    });
  });

  it('converts user file parts into one XML text content for model compatibility', (): void => {
    const messages = toRuntimeModelMessages([
      {
        id: 'user-1',
        sessionId: 'session-1',
        role: 'user',
        content: 'fix {{@src/foo.ts#L10-20}}',
        parts: [
          { type: 'text', text: 'fix ' },
          {
            type: 'file',
            id: 'file-part-1',
            filename: 'foo.ts',
            mime: 'text/plain',
            url: 'file:///workspace/src/foo.ts?start=10&end=20',
            path: 'src/foo.ts',
            sourceText: { start: 4, end: 25, value: '{{@src/foo.ts#L10-20}}' },
            snapshot: {
              content: 'export const foo = 1;',
              startLine: 10,
              endLine: 20,
              totalLines: 100,
              contentHash: 'hash-1',
              capturedAt: '2026-06-20T00:00:00.000Z'
            }
          }
        ],
        createdAt: '2026-06-20T00:00:00.000Z',
        finished: true
      }
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      role: 'user',
      content: 'fix <file path="src/foo.ts" lines="10-20">\nexport const foo = 1;\n</file>'
    });
    expect(JSON.stringify(messages)).not.toContain('"type":"file"');
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

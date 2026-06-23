/**
 * @file message-helper-compression.test.ts
 * @description BChat 压缩边界后的模型上下文组装测试。
 */
import { describe, expect, it } from 'vitest';
import { buildMessageContentHash } from '@/components/BChat/utils/compression/tokenEstimator';
import { convert, create, sliceMessagesFromCompressionBoundary } from '@/components/BChat/utils/messageHelper';
import type { Message } from '@/components/BChat/utils/types';

/**
 * 创建 user/assistant 测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @returns 聊天消息
 */
function createModelMessage(id: string, role: 'user' | 'assistant', content: string): Message {
  return {
    id,
    role,
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: '2026-06-05T00:00:00.000Z',
    finished: true
  };
}

/**
 * 创建压缩边界消息。
 * @param coveredUntilMessageId - 压缩覆盖到的最后消息 ID
 * @returns 压缩消息
 */
function createCompressionMessage(coveredUntilMessageId: string): Message {
  const content = 'COMPRESSED_CONTEXT\n## Conversation Continuity\n- 用户正在继续一个长聊天';

  return {
    id: 'compression-1',
    role: 'compression',
    content,
    parts: [{ type: 'text', text: content }],
    compression: {
      status: 'success',
      recordText: content,
      recordId: 'record-1',
      coveredUntilMessageId,
      sourceMessageIds: ['u1', 'a1']
    },
    createdAt: '2026-06-05T00:00:00.000Z',
    finished: true
  };
}

describe('messageHelper compression boundary assembly', () => {
  it('creates assistant placeholders with a real timestamp', (): void => {
    const placeholder = create.assistantPlaceholder();

    expect(placeholder.createdAt).not.toBe('');
    expect(Number.isNaN(Date.parse(placeholder.createdAt))).toBe(false);
  });

  it('restores preserved tail messages after the latest compression boundary', (): void => {
    const messages: Message[] = [
      createModelMessage('u1', 'user', '旧用户消息'),
      createModelMessage('a1', 'assistant', '旧助手回复'),
      createModelMessage('u2', 'user', 'tail 用户消息'),
      createModelMessage('a2', 'assistant', 'tail 助手回复'),
      createCompressionMessage('a1'),
      createModelMessage('u3', 'user', '压缩后的新问题')
    ];

    const sliced = sliceMessagesFromCompressionBoundary(messages);

    expect(sliced.map((message) => message.id)).toEqual(['compression-1', 'u2', 'a2', 'u3']);
  });

  it('uses an assistant compaction part as the latest compression boundary', (): void => {
    const compactedAssistant = createModelMessage('assistant-active', 'assistant', '');
    compactedAssistant.parts = [
      {
        type: 'compaction',
        auto: true,
        reason: 'auto',
        status: 'success',
        recordId: 'record-1',
        recordText: 'COMPRESSED_CONTEXT\n## Conversation Continuity\n- 自动压缩后的上下文',
        coveredUntilMessageId: 'a1',
        sourceMessageIds: ['u1', 'a1']
      }
    ];
    const messages: Message[] = [
      createModelMessage('u1', 'user', '旧用户消息'),
      createModelMessage('a1', 'assistant', '旧助手回复'),
      compactedAssistant,
      createModelMessage('u2', 'user', '压缩后的新问题')
    ];

    const sliced = sliceMessagesFromCompressionBoundary(messages);
    const modelMessages = convert.toModelMessages(messages);

    expect(sliced.map((message) => message.id)).toEqual(['assistant-active:compaction-boundary', 'u2']);
    expect(modelMessages).toEqual([
      { role: 'system', content: expect.stringContaining('COMPRESSED_CONTEXT') },
      { role: 'user', content: '压缩后的新问题' }
    ]);
  });

  it('adds a user continuation prompt when compaction covers the active assistant message', (): void => {
    const activeAssistant = createModelMessage('assistant-active', 'assistant', '');
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
        recordId: 'record-1',
        recordText: 'COMPRESSED_CONTEXT\n## Conversation Continuity\n- 自动压缩后的上下文',
        coveredUntilMessageId: 'assistant-active',
        sourceMessageIds: ['u1', 'assistant-active']
      }
    ];
    const messages: Message[] = [createModelMessage('u1', 'user', '旧用户消息'), activeAssistant];

    const modelMessages = convert.toModelMessages(messages);

    expect(modelMessages).toEqual([
      { role: 'system', content: expect.stringContaining('COMPRESSED_CONTEXT') },
      {
        role: 'user',
        content: expect.stringContaining('继续完成当前用户任务')
      }
    ]);
  });

  it('serializes assistant content appended after a compaction part as neutral context before a later user turn', (): void => {
    const compactedAssistant = createModelMessage('assistant-active', 'assistant', '');
    compactedAssistant.parts = [
      {
        type: 'compaction',
        auto: true,
        reason: 'auto',
        status: 'success',
        recordId: 'record-1',
        recordText: 'COMPRESSED_CONTEXT\n## Conversation Continuity\n- 自动压缩后的上下文',
        coveredUntilMessageId: 'a1',
        sourceMessageIds: ['u1', 'a1']
      },
      { type: 'text', text: '继续后的回答' }
    ];
    const messages: Message[] = [
      createModelMessage('u1', 'user', '旧用户消息'),
      createModelMessage('a1', 'assistant', '旧助手回复'),
      compactedAssistant,
      createModelMessage('u2', 'user', '压缩后的新问题')
    ];

    const modelMessages = convert.toModelMessages(messages);

    expect(modelMessages).toEqual([
      { role: 'system', content: expect.stringContaining('COMPRESSED_CONTEXT') },
      { role: 'user', content: expect.stringContaining('继续后的回答') },
      { role: 'user', content: '压缩后的新问题' }
    ]);
    expect(modelMessages[1]?.content).not.toContain('继续完成当前用户任务');
  });

  it('serializes post-compaction tool progress as user continuation context', (): void => {
    const compactedAssistant = createModelMessage('assistant-active', 'assistant', '');
    compactedAssistant.parts = [
      {
        type: 'compaction',
        auto: true,
        reason: 'auto',
        status: 'success',
        recordId: 'record-1',
        recordText: 'COMPRESSED_CONTEXT\n## Conversation Continuity\n- 自动压缩后的上下文',
        coveredUntilMessageId: 'a1',
        sourceMessageIds: ['u1', 'a1']
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
    const messages: Message[] = [createModelMessage('u1', 'user', '旧用户消息'), createModelMessage('a1', 'assistant', '旧助手回复'), compactedAssistant];

    const modelMessages = convert.toModelMessages(messages);

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

  it('converts the compression boundary as assistant context before tail messages', (): void => {
    const messages: Message[] = [
      createModelMessage('u1', 'user', '旧用户消息'),
      createModelMessage('a1', 'assistant', '旧助手回复'),
      createModelMessage('u2', 'user', 'tail 用户消息'),
      createModelMessage('a2', 'assistant', 'tail 助手回复'),
      createCompressionMessage('a1'),
      createModelMessage('u3', 'user', '压缩后的新问题')
    ];

    const modelMessages = convert.toModelMessages(messages);

    expect(modelMessages[0]).toEqual({ role: 'system', content: expect.stringContaining('COMPRESSED_CONTEXT') });
    expect(modelMessages[1]).toEqual({ role: 'user', content: 'tail 用户消息' });
    expect(modelMessages[2]?.role).toBe('assistant');
    expect(modelMessages[3]).toEqual({ role: 'user', content: '压缩后的新问题' });
  });

  it('converts persisted file parts into one XML text content', (): void => {
    const message: Message = {
      id: 'user-file',
      role: 'user',
      content: 'fix {{@src/foo.ts}}',
      parts: [
        { type: 'text', text: 'fix ' },
        {
          type: 'file',
          id: 'file-part-1',
          filename: 'foo.ts',
          mime: 'text/plain',
          url: 'file:///workspace/src/foo.ts',
          path: 'src/foo.ts',
          sourceText: { start: 4, end: 19, value: '{{@src/foo.ts}}' },
          snapshot: {
            content: 'export const foo = 1;',
            startLine: 1,
            endLine: 1,
            totalLines: 1,
            contentHash: 'hash-1',
            capturedAt: '2026-06-20T00:00:00.000Z'
          }
        }
      ],
      createdAt: '2026-06-20T00:00:00.000Z',
      finished: true
    };

    const modelMessages = convert.toModelMessages([message]);

    expect(modelMessages[0]).toEqual({
      role: 'user',
      content: 'fix <file path="src/foo.ts" lines="1-1">\nexport const foo = 1;\n</file>'
    });
    expect(JSON.stringify(modelMessages)).not.toContain('"type":"file"');
  });

  it('includes file part snapshots in message context signatures', (): void => {
    const message: Message = {
      id: 'user-file',
      role: 'user',
      content: 'fix {{@src/foo.ts}}',
      parts: [
        { type: 'text', text: 'fix ' },
        {
          type: 'file',
          id: 'file-part-1',
          filename: 'foo.ts',
          mime: 'text/plain',
          url: 'file:///workspace/src/foo.ts',
          path: 'src/foo.ts',
          sourceText: { start: 4, end: 19, value: '{{@src/foo.ts}}' },
          snapshot: {
            content: 'export const foo = 1;',
            startLine: 1,
            endLine: 1,
            totalLines: 1,
            contentHash: 'hash-1',
            capturedAt: '2026-06-20T00:00:00.000Z'
          }
        }
      ],
      createdAt: '2026-06-20T00:00:00.000Z',
      finished: true
    };

    expect(buildMessageContentHash(message)).toContain('src/foo.ts:1-1:hash-1');
  });
});

/**
 * @file message-helper-compression.test.ts
 * @description BChat 压缩边界后的模型上下文组装测试。
 */
import { describe, expect, it } from 'vitest';
import { convert, create, sliceMessagesFromCompressionBoundary } from '@/components/BChat/utils/messageHelper';
import { buildMessageContentHash } from '@/components/BChat/utils/compression/tokenEstimator';
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

    expect(modelMessages[0]).toEqual({ role: 'assistant', content: expect.stringContaining('COMPRESSED_CONTEXT') });
    expect(modelMessages[1]).toEqual({ role: 'user', content: 'tail 用户消息' });
    expect(modelMessages[2]?.role).toBe('assistant');
    expect(modelMessages[3]).toEqual({ role: 'user', content: '压缩后的新问题' });
  });

  it('converts persisted file parts into one XML text content', (): void => {
    const message: Message = {
      id: 'user-file',
      role: 'user',
      content: 'fix {{#src/foo.ts}}',
      parts: [
        { type: 'text', text: 'fix ' },
        {
          type: 'file',
          id: 'file-part-1',
          filename: 'foo.ts',
          mime: 'text/plain',
          url: 'file:///workspace/src/foo.ts',
          path: 'src/foo.ts',
          sourceText: { start: 4, end: 19, value: '{{#src/foo.ts}}' },
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
      content: 'fix {{#src/foo.ts}}',
      parts: [
        { type: 'text', text: 'fix ' },
        {
          type: 'file',
          id: 'file-part-1',
          filename: 'foo.ts',
          mime: 'text/plain',
          url: 'file:///workspace/src/foo.ts',
          path: 'src/foo.ts',
          sourceText: { start: 4, end: 19, value: '{{#src/foo.ts}}' },
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

/**
 * @file branch.test.ts
 * @description 聊天会话分支数据重建测试。
 */
import type { ChatMessageRecord, ChatSession } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { createSessionBranchData } from '../../../../../electron/main/modules/chat/runtime/branch.mts';

/**
 * 创建顺序可预测的测试 ID 工厂。
 * @returns 每次调用生成递增 ID 的函数
 */
function createIdFactory(): () => string {
  let index = 0;

  return (): string => {
    index += 1;
    return `branch-id-${index}`;
  };
}

/**
 * 创建测试源会话。
 * @returns 标题固定的助手会话
 */
function createSourceSession(): ChatSession {
  return {
    id: 'session-source',
    type: 'assistant',
    title: '原始标题',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    lastMessageAt: '2026-07-14T08:04:00.000Z'
  };
}

/**
 * 创建一条测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @param createdAt - 创建时间
 * @returns 完整聊天消息记录
 */
function createMessage(id: string, role: 'user' | 'assistant', content: string, createdAt: string): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-source',
    role,
    content,
    parts: [{ id: `part-${id}`, type: 'text', text: content }],
    createdAt,
    loading: false,
    finished: true,
    agentId: 'primary',
    runtimeId: `runtime-${id}`,
    parentRuntimeId: 'runtime-parent'
  };
}

describe('createSessionBranchData', (): void => {
  it('rejects generated IDs that collide with source branch data', (): void => {
    const sourceMessages = [
      createMessage('user-1', 'user', '问题一', '2026-07-14T08:01:00.000Z'),
      createMessage('assistant-1', 'assistant', '回答一', '2026-07-14T08:02:00.000Z')
    ];

    expect((): void => {
      createSessionBranchData({
        sourceSession: createSourceSession(),
        sourceMessages,
        targetMessageId: 'assistant-1',
        now: '2026-07-14T12:00:00.000Z',
        createId: (): string => 'session-source'
      });
    }).toThrow('会话分支 ID 冲突');
  });

  it('rejects targets that are not completed assistant messages with a user-facing error', (): void => {
    expect((): void => {
      createSessionBranchData({
        sourceSession: createSourceSession(),
        sourceMessages: [createMessage('user-1', 'user', '问题一', '2026-07-14T08:01:00.000Z')],
        targetMessageId: 'user-1',
        now: '2026-07-14T12:00:00.000Z',
        createId: createIdFactory()
      });
    }).toThrow('无法从该助手消息创建会话分支');
  });

  it('copies through the target assistant message into an independent session with the same title', (): void => {
    const sourceSession = createSourceSession();
    const sourceMessages = [
      createMessage('user-1', 'user', '问题一', '2026-07-14T08:01:00.000Z'),
      createMessage('assistant-1', 'assistant', '回答一', '2026-07-14T08:02:00.000Z'),
      createMessage('user-2', 'user', '问题二', '2026-07-14T08:03:00.000Z'),
      createMessage('assistant-2', 'assistant', '回答二', '2026-07-14T08:04:00.000Z')
    ];
    sourceMessages[0].files = [{ id: 'file-1', name: '说明.md', type: 'document', path: '/workspace/说明.md' }];
    sourceMessages[0].usage = { inputTokens: 2, outputTokens: 0, totalTokens: 2 };
    sourceMessages[1].usage = { inputTokens: 3, outputTokens: 5, totalTokens: 8 };
    const sourceSnapshot = structuredClone(sourceMessages);

    const result = createSessionBranchData({
      sourceSession,
      sourceMessages,
      targetMessageId: 'assistant-1',
      now: '2026-07-14T12:00:00.000Z',
      createId: createIdFactory()
    });

    expect(result.session).toMatchObject({
      id: 'branch-id-1',
      type: 'assistant',
      title: '原始标题',
      createdAt: '2026-07-14T12:00:00.000Z',
      updatedAt: '2026-07-14T12:00:00.000Z',
      lastMessageAt: '2026-07-14T12:00:00.000Z',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
    });
    expect(result.messages.map((message: ChatMessageRecord): string => message.content)).toEqual(['问题一', '回答一']);
    expect(result.messages.every((message: ChatMessageRecord): boolean => message.sessionId === result.session.id)).toBe(true);
    expect(result.messages.map((message: ChatMessageRecord): string => message.id)).not.toContain('user-1');
    expect(result.messages.map((message: ChatMessageRecord): string => message.id)).not.toContain('assistant-1');
    expect(result.messages.flatMap((message: ChatMessageRecord): string[] => message.parts.map((part): string => part.id ?? ''))).not.toContain('part-user-1');
    expect(result.messages.every((message: ChatMessageRecord): boolean => message.runtimeId === undefined && message.parentRuntimeId === undefined)).toBe(true);
    expect(result.messages[0].files).toEqual(sourceMessages[0].files);
    expect(sourceMessages).toEqual(sourceSnapshot);
  });
});

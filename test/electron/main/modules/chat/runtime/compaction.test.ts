/**
 * @file compaction.test.ts
 * @description ChatRuntime 主进程上下文压缩服务测试。
 */
import type { ChatMessageRecord } from 'types/chat';
import type { ChatRuntimeEventMap } from 'types/chat-runtime';
import type { CompressionRecord } from 'types/compression';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeCompactionService } from '../../../../../../electron/main/modules/chat/runtime/compaction.mjs';

/** 已捕获的 runtime 事件。 */
type CapturedRuntimeEvent = {
  /** 事件名。 */
  name: keyof ChatRuntimeEventMap;
  /** 事件载荷。 */
  payload: ChatRuntimeEventMap[keyof ChatRuntimeEventMap];
};

/**
 * 创建测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @returns 聊天消息
 */
function createMessage(id: string, role: ChatMessageRecord['role'], content: string): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-1',
    role,
    content,
    parts: content ? [{ type: 'text', text: content }] : [],
    createdAt: '2026-06-18T00:00:00.000Z',
    finished: true
  };
}

/**
 * 创建压缩记录测试数据。
 * @returns 压缩记录
 */
function createRecord(): CompressionRecord {
  return {
    id: 'record-1',
    sessionId: 'session-1',
    buildMode: 'full_rebuild',
    coveredStartMessageId: 'u1',
    coveredEndMessageId: 'a1',
    coveredUntilMessageId: 'a1',
    sourceMessageIds: ['u1', 'a1'],
    preservedMessageIds: [],
    recordText: '目标：继续主进程压缩迁移',
    structuredSummary: {
      goal: '继续主进程压缩迁移',
      recentTopic: 'ChatRuntime compaction',
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: ['用户原始需求：替换 /compact 和自动压缩流程'],
      fileContext: [],
      openQuestions: [],
      pendingActions: ['继续迁移 renderer 入口']
    },
    triggerReason: 'manual',
    messageCountSnapshot: 1,
    charCountSnapshot: 120,
    schemaVersion: 3,
    status: 'valid',
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z'
  };
}

/**
 * 创建事件收集器。
 * @returns 事件收集器
 */
function createEventCollector(): {
  events: CapturedRuntimeEvent[];
  emit: <TName extends keyof ChatRuntimeEventMap>(name: TName, payload: ChatRuntimeEventMap[TName]) => void;
} {
  const events: CapturedRuntimeEvent[] = [];

  return {
    events,
    emit: <TName extends keyof ChatRuntimeEventMap>(name: TName, payload: ChatRuntimeEventMap[TName]): void => {
      events.push({ name, payload });
    }
  };
}

describe('runtime compaction service', (): void => {
  it('creates a pending message and updates it to a successful compression boundary', async (): Promise<void> => {
    const messages = [
      createMessage('u1', 'user', '第一轮用户消息，需要压缩'),
      createMessage('a1', 'assistant', '第一轮助手回复，需要压缩'),
      createMessage('u2', 'user', '第二轮用户消息，tail 保留'),
      createMessage('a2', 'assistant', '第二轮助手回复，tail 保留'),
      createMessage('u3', 'user', '第三轮用户消息，tail 保留'),
      createMessage('a3', 'assistant', '第三轮助手回复，tail 保留')
    ];
    const persistedMessages: ChatMessageRecord[] = [];
    const updatedMessages: ChatMessageRecord[] = [];
    const collector = createEventCollector();
    const compressSessionManually = vi.fn().mockResolvedValue(createRecord());
    const abortController = new AbortController();
    const service = createRuntimeCompactionService({
      emit: collector.emit,
      createMessageId: () => 'compression-message-1',
      now: () => '2026-06-18T00:00:00.000Z',
      persistMessage: (message) => {
        persistedMessages.push(message);
      },
      updateMessage: (message) => {
        updatedMessages.push(message);
      },
      compressor: { compressSessionManually },
      renderBoundary: () => 'COMPRESSED_CONTEXT\n## Raw User Requirements\n- 替换 /compact 和自动压缩流程'
    });

    const result = await service.compact({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      reason: 'manual',
      contextWindow: 128_000,
      messages,
      signal: abortController.signal
    });

    expect(result).toEqual({ status: 'success', messageId: 'compression-message-1', recordId: 'record-1' });
    expect(persistedMessages[0]).toMatchObject({
      id: 'compression-message-1',
      role: 'compression',
      content: '正在压缩上下文…',
      loading: true,
      finished: false,
      runtimeId: 'runtime-1',
      agentId: 'agent-1'
    });
    expect(compressSessionManually.mock.calls[0][0].messages.map((message: ChatMessageRecord) => message.id)).toEqual(['u1', 'a1']);
    expect(updatedMessages[0]).toMatchObject({
      id: 'compression-message-1',
      content: expect.stringContaining('COMPRESSED_CONTEXT'),
      loading: false,
      finished: true,
      compression: {
        status: 'success',
        recordId: 'record-1',
        coveredUntilMessageId: 'a1',
        sourceMessageIds: ['u1', 'a1']
      }
    });
    expect(collector.events.map((event) => event.name)).toEqual(['chat:runtime:message-created', 'chat:runtime:message-updated']);
    for (const event of collector.events) {
      expect(event.payload).not.toHaveProperty('signal');
      expect(event.payload).not.toHaveProperty('messages');
      expect(event.payload).not.toHaveProperty('contextWindow');
    }
  });

  it('skips compression when no new model messages exist after the latest boundary', async (): Promise<void> => {
    const boundary = createMessage('c1', 'compression', 'COMPRESSED_CONTEXT');
    boundary.compression = {
      status: 'success',
      recordText: 'COMPRESSED_CONTEXT',
      coveredUntilMessageId: 'a1'
    };
    const collector = createEventCollector();
    const compressSessionManually = vi.fn();
    const service = createRuntimeCompactionService({
      emit: collector.emit,
      persistMessage: vi.fn(),
      updateMessage: vi.fn(),
      compressor: { compressSessionManually }
    });

    const result = await service.compact({
      runtimeId: 'runtime-2',
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      reason: 'auto',
      messages: [createMessage('u1', 'user', '旧用户消息'), createMessage('a1', 'assistant', '旧助手回复'), boundary]
    });

    expect(result).toEqual({ status: 'skipped', reason: 'already_compact' });
    expect(compressSessionManually).not.toHaveBeenCalled();
    expect(collector.events).toEqual([]);
  });

  it('updates the pending compression message to cancelled when the signal is aborted', async (): Promise<void> => {
    const messages = [createMessage('u1', 'user', '需要压缩'), createMessage('a1', 'assistant', '压缩内容')];
    const updatedMessages: ChatMessageRecord[] = [];
    const collector = createEventCollector();
    const abortController = new AbortController();
    const compressSessionManually = vi.fn(async (input: { signal?: AbortSignal }) => {
      abortController.abort();
      expect(input.signal?.aborted).toBe(true);
      return undefined;
    });
    const service = createRuntimeCompactionService({
      emit: collector.emit,
      createMessageId: () => 'compression-message-cancelled',
      now: () => '2026-06-18T00:00:00.000Z',
      persistMessage: vi.fn(),
      updateMessage: (message) => {
        updatedMessages.push(message);
      },
      compressor: { compressSessionManually }
    });

    const result = await service.compact({
      runtimeId: 'runtime-compact-cancelled',
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      reason: 'manual',
      messages,
      signal: abortController.signal
    });

    expect(result).toEqual({ status: 'cancelled', messageId: 'compression-message-cancelled' });
    expect(updatedMessages.at(-1)).toMatchObject({
      id: 'compression-message-cancelled',
      role: 'compression',
      content: '压缩已取消',
      loading: false,
      finished: true,
      compression: {
        status: 'cancelled'
      }
    });
    expect(collector.events.at(-1)).toMatchObject({
      name: 'chat:runtime:message-updated',
      payload: expect.objectContaining({
        message: expect.objectContaining({
          id: 'compression-message-cancelled',
          compression: expect.objectContaining({ status: 'cancelled' })
        })
      })
    });
  });
});

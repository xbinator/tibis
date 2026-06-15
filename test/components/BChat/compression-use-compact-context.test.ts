/**
 * @file compression-use-compact-context.test.ts
 * @description BChat 手动压缩 hook 与压缩可观察性集成测试。
 */
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompactContext } from '@/components/BChat/hooks/useCompactContext';
import type { CompressionRecord } from '@/components/BChat/utils/compression/types';
import type { Message } from '@/components/BChat/utils/types';

/** 压缩协调器测试替身。 */
const mockCompressSessionManually = vi.hoisted(() =>
  vi.fn<(input: { sessionId: string; messages: Message[]; signal?: AbortSignal }) => Promise<CompressionRecord | undefined>>()
);

/** 日志测试替身。 */
const mockLogger = vi.hoisted(() => ({
  info: vi.fn<(message: string) => Promise<void>>()
}));

vi.mock('@/components/BChat/utils/compression/coordinator', () => ({
  createCompressionCoordinator: vi.fn(() => ({
    compressSessionManually: mockCompressSessionManually
  }))
}));

vi.mock('@/shared/logger', () => ({
  logger: mockLogger
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => ({})),
  unwrap: vi.fn((value: unknown) => value)
}));

/**
 * 创建 user/assistant 测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @returns 聊天消息
 */
function createMessage(id: string, role: 'user' | 'assistant', content: string): Message {
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
 * 创建压缩记录测试数据。
 * @returns 压缩记录
 */
function createRecord(): CompressionRecord {
  return {
    id: 'record-hook-1',
    sessionId: 'session-1',
    buildMode: 'full_rebuild',
    coveredStartMessageId: 'u1',
    coveredEndMessageId: 'a1',
    coveredUntilMessageId: 'a1',
    sourceMessageIds: ['u1', 'a1'],
    preservedMessageIds: [],
    recordText: '目标：继续长聊天',
    structuredSummary: {
      goal: '继续长聊天',
      recentTopic: '压缩可观察性',
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: ['用户原始需求：继续推进通用长聊天压缩'],
      fileContext: [],
      openQuestions: [],
      pendingActions: ['继续验证压缩链路']
    },
    generalSummary: {
      conversationContinuity: ['用户希望有计划、有节奏地推进需求'],
      goal: '继续长聊天压缩需求',
      recentTopic: '压缩可观察性',
      userPreferences: ['希望按长期需求节奏推进'],
      constraints: ['代码写完不要提交'],
      decisions: ['先完成压缩交接稿和可观察性'],
      criticalFacts: ['压缩边界仍以 assistant role 注入'],
      rawUserRequirements: ['继续推进通用长聊天压缩'],
      openLoops: ['继续验证压缩链路'],
      recentDirection: ['从实现阶段转向验证和收尾'],
      fileContext: []
    },
    triggerReason: 'manual',
    messageCountSnapshot: 1,
    charCountSnapshot: 120,
    schemaVersion: 3,
    status: 'valid',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z'
  };
}

describe('useCompactContext compression observability', () => {
  beforeEach((): void => {
    mockCompressSessionManually.mockReset();
    mockLogger.info.mockReset();
  });

  it('logs compression metrics after a successful manual compression and keeps tail messages out of the summary source', async (): Promise<void> => {
    const messages = ref<Message[]>([
      createMessage('u1', 'user', '第一轮用户消息，需要被压缩'),
      createMessage('a1', 'assistant', '第一轮助手回复，需要被压缩'),
      createMessage('u2', 'user', '第二轮用户消息，作为 tail 保留'),
      createMessage('a2', 'assistant', '第二轮助手回复，作为 tail 保留'),
      createMessage('u3', 'user', '第三轮用户消息，作为 tail 保留'),
      createMessage('a3', 'assistant', '第三轮助手回复，作为 tail 保留')
    ]);
    const persistedLists: Message[][] = [];

    mockCompressSessionManually.mockResolvedValue(createRecord());

    const compact = useCompactContext({
      messages,
      getSessionId: () => 'session-1',
      getContextWindow: () => 128_000,
      beginCompactTask: () => ({ ok: true, signal: new AbortController().signal }),
      finishCompactTask: vi.fn<() => void>(),
      persistMessage: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      persistMessages: vi
        .fn<(sessionId: string | undefined, nextMessages: Message[]) => Promise<void>>()
        .mockImplementation(async (_sessionId, nextMessages) => {
          persistedLists.push(nextMessages.map((message) => ({ ...message, parts: [...message.parts] })));
        }),
      scrollToBottom: vi.fn<() => void>(),
      showToast: vi.fn()
    });

    await compact.handleCompactContext();

    expect(mockCompressSessionManually).toHaveBeenCalledTimes(1);
    expect(mockCompressSessionManually.mock.calls[0][0].messages.map((message) => message.id)).toEqual(['u1', 'a1']);
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info.mock.calls[0][0]).toContain('[BChatCompression] record=record-hook-1 schema=3');
    expect(mockLogger.info.mock.calls[0][0]).toContain('raw_requirements=1 open_loops=1');
    expect(persistedLists.at(-1)?.at(-1)?.compression?.status).toBe('success');
    expect(persistedLists.at(-1)?.at(-1)?.content).toContain('## Raw User Requirements');
  });
});

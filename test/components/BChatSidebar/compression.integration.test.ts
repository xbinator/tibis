/**
 * @file compression.integration.test.ts
 * @description 压缩功能集成测试：测试完整的压缩流程和 UI 交互。
 */
import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * @vitest-environment jsdom
 */

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null)
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock
});

// Mock 存储模块
vi.mock('@/shared/storage', () => ({
  providerStorage: {
    getProvider: vi.fn().mockResolvedValue(null)
  },
  serviceModelsStorage: {
    getConfig: vi.fn().mockResolvedValue(null)
  }
}));

// Mock electron API
vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn().mockReturnValue({
    aiInvoke: vi.fn().mockResolvedValue([null, { text: '{}' }]),
    chatCompressionGetLatest: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    chatCompressionCreate: vi.fn().mockImplementation((record: Record<string, unknown>) => Promise.resolve({
      ok: true,
      data: {
        id: 'record-1',
        sessionId: 'session-1',
        buildMode: record.buildMode ?? 'full',
        derivedFromRecordId: undefined,
        coveredStartMessageId: 'm1',
        coveredEndMessageId: 'm14',
        coveredUntilMessageId: 'm14',
        sourceMessageIds: [],
        preservedMessageIds: [],
        recordText: '压缩摘要',
        structuredSummary: undefined,
        triggerReason: record.triggerReason ?? 'manual',
        messageCountSnapshot: 14,
        charCountSnapshot: 0,
        schemaVersion: 2,
        status: 'valid',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    })),
    chatCompressionUpdateStatus: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    chatCompressionGetAll: vi.fn().mockResolvedValue({ ok: true, data: [] })
  }),
  hasElectronAPI: vi.fn().mockReturnValue(false),
  unwrap: (result: { ok: true; data: unknown } | { ok: false; error: string; code: string }) => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }
}));

/**
 * 创建测试用消息
 */
function createTestMessage(id: string, role: 'user' | 'assistant', content: string): Message {
  return {
    id,
    role,
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: new Date().toISOString(),
    loading: false
  };
}

describe('Compression Integration', () => {
  describe('useCompactContext compress', () => {
    it('provides compression state and methods', async () => {
      const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');

      const messages = ref([createTestMessage('m1', 'user', 'Hello')]);
      const result = useCompactContext({
        messages,
        getSessionId: () => 'session-1',
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask: vi.fn(),
        persistMessage: vi.fn(),
        persistMessages: vi.fn(),
        scrollToBottom: vi.fn()
      });

      expect(result.compressing.value).toBe(false);
      expect(result.error.value).toBeUndefined();
      expect(typeof result.compress).toBe('function');
    });

    it('handles compression without session ID', async () => {
      const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');

      const messages = ref([createTestMessage('m1', 'user', 'Hello')]);
      const result = useCompactContext({
        messages,
        getSessionId: () => undefined,
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask: vi.fn(),
        persistMessage: vi.fn(),
        persistMessages: vi.fn(),
        scrollToBottom: vi.fn()
      });

      const compressResult = await result.compress();
      expect(compressResult.success).toBe(false);
      expect(result.error.value).toBe('没有活跃的会话');
    });

    it('handles compression with empty messages', async () => {
      const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');

      const messages = ref<Message[]>([]);
      const result = useCompactContext({
        messages,
        getSessionId: () => 'session-1',
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask: vi.fn(),
        persistMessage: vi.fn(),
        persistMessages: vi.fn(),
        scrollToBottom: vi.fn()
      });

      const compressResult = await result.compress();
      expect(compressResult.success).toBe(false);
      expect(result.error.value).toBe('没有可压缩的消息');
    });

    it('supports manual compression even when the last message is from the assistant', async () => {
      const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');

      const messagesArr: Message[] = [];
      for (let i = 1; i <= 14; i += 1) {
        messagesArr.push(createTestMessage(`m${i}`, i % 2 === 1 ? 'user' : 'assistant', `Message ${i}`));
      }
      const messages = ref(messagesArr);
      const result = useCompactContext({
        messages,
        getSessionId: () => 'session-1',
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask: vi.fn(),
        persistMessage: vi.fn(),
        persistMessages: vi.fn(),
        scrollToBottom: vi.fn()
      });

      const compressResult = await result.compress();
      expect(compressResult.success).toBe(true);
      expect(compressResult.record?.triggerReason).toBe('manual');
    });
  });

  describe('useCompactContext.compress flow', () => {
    it('returns the created compression record after successful compression', async () => {
      const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');

      const messagesArr: Message[] = [];
      for (let i = 1; i <= 14; i += 1) {
        messagesArr.push(createTestMessage(`m${i}`, i % 2 === 1 ? 'user' : 'assistant', `Message ${i}`));
      }
      const messages = ref(messagesArr);
      const result = useCompactContext({
        messages,
        getSessionId: () => 'session-1',
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask: vi.fn(),
        persistMessage: vi.fn(),
        persistMessages: vi.fn(),
        scrollToBottom: vi.fn()
      });

      const compressResult = await result.compress();
      expect(compressResult.success).toBe(true);
      expect(compressResult.record).toBeDefined();
    });

    it('returns cancelled when the compression task is aborted before execution completes', async () => {
      const { useCompactContext } = await import('@/components/BChatSidebar/hooks/useCompactContext');

      const messagesArr: Message[] = [];
      for (let i = 1; i <= 14; i += 1) {
        messagesArr.push(createTestMessage(`m${i}`, i % 2 === 1 ? 'user' : 'assistant', `Message ${i}`));
      }
      const controller = new AbortController();
      controller.abort();
      const messages = ref(messagesArr);
      const result = useCompactContext({
        messages,
        getSessionId: () => 'session-1',
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask: vi.fn(),
        persistMessage: vi.fn(),
        persistMessages: vi.fn(),
        scrollToBottom: vi.fn()
      });

      const compressResult = await result.compress(controller.signal);
      expect(compressResult.success).toBe(false);
      expect(compressResult.cancelled).toBe(true);
      expect(result.error.value).toBeUndefined();
    });
  });
});

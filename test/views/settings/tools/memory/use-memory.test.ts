/**
 * @file use-memory.test.ts
 * @description 记忆整理 Hook 兼容普通文本 JSON fallback 的单元测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyMemoryDoc } from '@/ai/memory/parser';
import type { MemoryDoc } from '@/ai/memory/types';
import { useMemory } from '@/views/settings/tools/memory/hooks/useMemory';

/** AI 调用消息。 */
interface MockAIMessage {
  /** 消息角色。 */
  role: string;
  /** 消息内容。 */
  content: string;
}

/** AI 调用参数。 */
interface MockAIInvokePayload {
  /** 服务商 ID。 */
  providerId: string;
  /** 模型 ID。 */
  modelId: string;
  /** 消息列表。 */
  messages: MockAIMessage[];
  /** 结构化输出配置。 */
  output?: unknown;
}

/** AI 调用结果。 */
type MockAIInvokeResult = Promise<[{ message: string } | null, { output?: unknown; text?: string } | undefined]>;

/** mock agent.invoke。 */
const mockInvoke = vi.hoisted(() => vi.fn<(payload: MockAIInvokePayload) => MockAIInvokeResult>());

/** mock serviceModelStore.getAvailableServiceConfig。 */
const mockGetAvailableServiceConfig = vi.hoisted(() => vi.fn<() => Promise<{ providerId: string; modelId: string } | null>>());

/** mock memoryStore.saveMemory。 */
const mockSaveMemory = vi.hoisted(() => vi.fn<() => Promise<void>>());

/** mock memory store 状态。 */
const mockMemoryStore = vi.hoisted(() => ({
  doc: undefined as MemoryDoc | undefined,
  saveMemory: mockSaveMemory
}));

/** mock 全局消息。 */
const mockMessage = vi.hoisted(() => ({
  success: vi.fn<(content: string) => void>(),
  warning: vi.fn<(content: string) => void>(),
  error: vi.fn<(content: string) => void>()
}));

vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    agent: { invoke: mockInvoke }
  })
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: () => ({
    getAvailableServiceConfig: mockGetAvailableServiceConfig
  })
}));

vi.mock('@/stores/ai/memory', () => ({
  useMemoryStore: () => mockMemoryStore
}));

vi.mock('ant-design-vue', () => ({
  message: mockMessage
}));

describe('useMemory', () => {
  beforeEach((): void => {
    mockInvoke.mockReset();
    mockGetAvailableServiceConfig.mockReset();
    mockSaveMemory.mockReset();
    mockMessage.success.mockReset();
    mockMessage.warning.mockReset();
    mockMessage.error.mockReset();
    mockMemoryStore.doc = createEmptyMemoryDoc();
    mockGetAvailableServiceConfig.mockResolvedValue({ providerId: 'provider-chat', modelId: 'model-chat' });
    mockSaveMemory.mockResolvedValue(undefined);
  });

  it('retries with plain text JSON when structured output cannot be parsed', async (): Promise<void> => {
    mockInvoke.mockResolvedValueOnce([{ message: 'No object generated: could not parse the response.' }, undefined]).mockResolvedValueOnce([
      null,
      {
        text: `\`\`\`json
{
  "sections": [
    { "category": "Instructions", "items": [] },
    { "category": "Preferences", "items": [{ "content": "用户喜欢 TypeScript" }] },
    { "category": "Habits", "items": [] },
    { "category": "Facts", "items": [] },
    { "category": "Projects", "items": [] },
    { "category": "Current Context", "items": [] }
  ]
}
\`\`\``
      }
    ]);

    const { organize } = useMemory();
    const success = await organize('记住我喜欢 TypeScript');

    const firstPayload = mockInvoke.mock.calls[0]?.[0];
    const fallbackPayload = mockInvoke.mock.calls[1]?.[0];

    expect(success).toBe(true);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(firstPayload?.output).toBeDefined();
    expect(fallbackPayload?.output).toBeUndefined();
    expect(mockMemoryStore.doc?.sections.find((section) => section.category === 'Preferences')?.items).toEqual([{ content: '用户喜欢 TypeScript' }]);
    expect(mockSaveMemory).toHaveBeenCalledTimes(1);
    expect(mockMessage.success).toHaveBeenCalledWith('记忆内容整理完成');
  });
});

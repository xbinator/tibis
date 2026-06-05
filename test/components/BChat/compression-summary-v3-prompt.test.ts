/**
 * @file compression-summary-v3-prompt.test.ts
 * @description BChatSidebar v3 摘要提示词与 fallback 保真测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateStructuredSummary } from '@/components/BChatSidebar/utils/compression/structuredSummaryGenerator';
import type { StructuredConversationSummary, TrimmedMessageItem } from '@/components/BChatSidebar/utils/compression/types';

/** AI 调用参数测试视图。 */
interface MockAIInvokeOptions {
  /** 模型消息列表 */
  messages: Array<{ role: string; content: string }>;
  /** 结构化输出配置 */
  output?: {
    /** 输出 schema */
    schema?: unknown;
    /** 输出 schema 名称 */
    name?: string;
    /** 输出 schema 描述 */
    description?: string;
  };
}

/** AI 调用测试替身类型。 */
type MockAIInvoke = (provider: unknown, options: MockAIInvokeOptions) => Promise<[unknown, { output?: unknown; text: string }]>;

/** 存储层测试替身。 */
const mockStorage = vi.hoisted(() => ({
  providerStorage: {
    getProvider: vi.fn<() => Promise<{ id: string; name: string; apiKey: string; baseUrl: string; type: string; isEnabled: boolean } | null>>()
  },
  serviceModelsStorage: {
    getConfig: vi.fn<() => Promise<{ providerId: string; modelId: string } | null>>()
  }
}));

/** Electron API 测试替身。 */
const mockElectron = vi.hoisted(() => ({
  aiInvoke: vi.fn<MockAIInvoke>()
}));

vi.mock('@/shared/storage', () => ({
  providerStorage: mockStorage.providerStorage,
  serviceModelsStorage: mockStorage.serviceModelsStorage
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => mockElectron)
}));

/**
 * 创建模型输出摘要。
 * @returns 结构化摘要
 */
function createModelSummary(): StructuredConversationSummary {
  return {
    goal: '继续长聊天',
    recentTopic: '阅读和睡眠安排',
    userPreferences: ['温和直接'],
    constraints: ['不要催促'],
    decisions: [],
    importantFacts: ['用户最近睡眠不好'],
    fileContext: [],
    openQuestions: [],
    pendingActions: ['继续聊睡眠安排']
  };
}

describe('generateStructuredSummary v3 prompt compatibility', () => {
  beforeEach((): void => {
    mockStorage.serviceModelsStorage.getConfig.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    mockStorage.providerStorage.getProvider.mockResolvedValue({
      id: 'provider-1',
      name: 'Mock Provider',
      apiKey: 'mock-key',
      baseUrl: 'https://mock.invalid',
      type: 'openai',
      isEnabled: true
    });
    mockElectron.aiInvoke.mockReset();
    mockElectron.aiInvoke.mockResolvedValue([null, { output: createModelSummary(), text: '' }]);
  });

  it('tells the model to preserve conversation continuity, raw requirements, and refreshed open loops', async (): Promise<void> => {
    await generateStructuredSummary({
      items: [
        {
          messageId: 'user-1',
          role: 'user',
          trimmedText: '请记住我的偏好：回答要温和直接，不要催促。下次继续聊我的睡眠安排。'
        }
      ],
      previousRecord: {
        recordText: '旧摘要',
        structuredSummary: createModelSummary(),
        generalSummary: {
          conversationContinuity: ['用户希望自然连续地聊天'],
          goal: '继续长期闲聊',
          recentTopic: '睡眠安排',
          userPreferences: ['温和直接'],
          constraints: ['不要催促'],
          decisions: [],
          criticalFacts: ['用户最近睡眠不好'],
          rawUserRequirements: ['不要直接给鸡汤'],
          openLoops: ['旧问题已经被回答时必须移除'],
          recentDirection: ['用户从工作压力转向睡眠问题'],
          fileContext: []
        }
      }
    });

    const options = mockElectron.aiInvoke.mock.calls[0]?.[1];
    const promptText = options?.messages.map((message) => message.content).join('\n') ?? '';

    expect(promptText).toContain('对话连续性');
    expect(promptText).toContain('用户原始需求');
    expect(promptText).toContain('未完成事项');
    expect(promptText).toContain('已经明确回答、取消或替代');
    expect(promptText).toContain('generalSummary');
  });

  it('keeps raw requirements in fallback summary when model config is unavailable', async (): Promise<void> => {
    mockStorage.serviceModelsStorage.getConfig.mockResolvedValue(null);
    const items: TrimmedMessageItem[] = [
      {
        messageId: 'user-1',
        role: 'user',
        trimmedText: '请记住我的偏好：回答要温和直接，不要催促。下次继续聊我的睡眠安排。'
      }
    ];

    const summary = await generateStructuredSummary({ items });

    expect(summary.importantFacts.join('\n')).toContain('回答要温和直接');
    expect(summary.pendingActions.join('\n')).toContain('继续');
  });
});

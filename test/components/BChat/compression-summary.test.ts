/**
 * @file compression-summary.test.ts
 * @description BChatSidebar 上下文压缩摘要保真度测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateStructuredSummary, generateSummaryText } from '@/components/BChatSidebar/utils/compression/structuredSummaryGenerator';
import type { TrimmedMessageItem } from '@/components/BChatSidebar/utils/compression/types';

/** AI 调用返回值类型。 */
type MockAIInvokeResult = Promise<[unknown, { output?: unknown; text: string }]>;

/** 存储层测试替身：无聊天模型配置时触发 fallback 摘要路径。 */
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
  aiInvoke: vi.fn<() => MockAIInvokeResult>()
}));

vi.mock('@/shared/storage', () => ({
  providerStorage: mockStorage.providerStorage,
  serviceModelsStorage: mockStorage.serviceModelsStorage
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => mockElectron)
}));

describe('generateStructuredSummary fallback', () => {
  beforeEach((): void => {
    mockStorage.serviceModelsStorage.getConfig.mockResolvedValue(null);
    mockStorage.providerStorage.getProvider.mockResolvedValue(null);
    mockElectron.aiInvoke.mockReset();
  });

  it('preserves explicit fund codes and requested output requirements when model config is unavailable', async (): Promise<void> => {
    const items: TrimmedMessageItem[] = [
      {
        messageId: 'user-1',
        role: 'user',
        trimmedText:
          '金融搜索服务\n' +
          '帮忙查询以下基金：024479、022365、006476、008586、015945、002611、018345、008888、002190、013943、011036、161725\n' +
          '需要统计内容：1. 今天的涨跌幅 2. 昨天的涨跌幅 3. 按照今天涨跌幅进行排序（从高到低）4. 给出简单的操作建议'
      }
    ];

    const summary = await generateStructuredSummary({ items });
    const summaryText = generateSummaryText(summary);

    expect(summaryText).toContain('024479');
    expect(summaryText).toContain('161725');
    expect(summaryText).toContain('今天的涨跌幅');
    expect(summaryText).toContain('昨天的涨跌幅');
    expect(summaryText).toContain('排序');
    expect(summaryText).toContain('操作建议');
  });

  it('merges explicit user requirements back when AI summary omits the detailed list', async (): Promise<void> => {
    mockStorage.serviceModelsStorage.getConfig.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    mockStorage.providerStorage.getProvider.mockResolvedValue({
      id: 'provider-1',
      name: 'Mock Provider',
      apiKey: 'mock-key',
      baseUrl: 'https://mock.invalid',
      type: 'openai',
      isEnabled: true
    });
    mockElectron.aiInvoke.mockResolvedValue([
      null,
      {
        output: {
          goal: '润色金融搜索服务文案',
          recentTopic: '金融搜索服务',
          userPreferences: [],
          constraints: [],
          decisions: [],
          importantFacts: [],
          fileContext: [],
          openQuestions: [],
          pendingActions: []
        },
        text: ''
      }
    ]);

    const summary = await generateStructuredSummary({
      items: [
        {
          messageId: 'user-1',
          role: 'user',
          trimmedText:
            '帮忙查询以下基金：024479、022365、006476、008586、015945、002611、018345、008888、002190、013943、011036、161725。需要今天涨跌幅、昨天涨跌幅、按今天涨跌幅排序，并给出操作建议。'
        }
      ]
    });
    const summaryText = generateSummaryText(summary);

    expect(summaryText).toContain('024479');
    expect(summaryText).toContain('161725');
    expect(summaryText).toContain('今天涨跌幅');
    expect(summaryText).toContain('操作建议');
  });
});

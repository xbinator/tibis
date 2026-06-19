/**
 * @file structured-summary-generator.test.ts
 * @description ChatRuntime 主进程结构化摘要生成器测试。
 */
import type { StructuredConversationSummary } from 'types/compression';
import { describe, expect, it, vi } from 'vitest';
import {
  createRuntimeStructuredSummaryGenerator,
  createRuntimeSummaryInvoke
} from '../../../../../../electron/main/modules/chat/runtime/compaction/structured-summary-generator.mjs';

describe('createRuntimeStructuredSummaryGenerator', (): void => {
  it('uses AI structured output and merges explicit user requirements', async (): Promise<void> => {
    const aiSummary: StructuredConversationSummary = {
      goal: '迁移压缩流程',
      recentTopic: '主进程 runtime 压缩',
      userPreferences: [],
      constraints: ['不要提交代码'],
      decisions: [],
      importantFacts: ['已新增 runtime compact IPC'],
      fileContext: [],
      openQuestions: [],
      pendingActions: ['继续迁移摘要生成器']
    };
    const invoke = vi.fn().mockResolvedValue({
      text: '',
      output: aiSummary
    });
    const generator = createRuntimeStructuredSummaryGenerator({ invoke });

    const summary = await generator.generate({
      items: [
        {
          messageId: 'u1',
          role: 'user',
          trimmedText: '继续，把 AI 结构化摘要生成迁到主进程'
        },
        {
          messageId: 'a1',
          role: 'assistant',
          trimmedText: '可以，我会先做主进程生成器'
        }
      ]
    });

    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user', content: expect.stringContaining('CONVERSATION_CONTENT') })
        ])
      })
    );
    expect(summary.goal).toBe('迁移压缩流程');
    expect(summary.importantFacts).toContain('已新增 runtime compact IPC');
    expect(summary.importantFacts).toContain('用户原始需求：继续，把 AI 结构化摘要生成迁到主进程');
    expect(summary.pendingActions).toContain('继续按用户原始需求完成后续查询、整理、排序或输出');
  });

  it('falls back when AI invocation fails', async (): Promise<void> => {
    const generator = createRuntimeStructuredSummaryGenerator({
      invoke: vi.fn().mockRejectedValue(new Error('network down'))
    });

    const summary = await generator.generate({
      items: [
        {
          messageId: 'u1',
          role: 'user',
          trimmedText: '替换 /compact 和自动压缩流程'
        }
      ]
    });

    expect(summary.goal).toBe('保留并继续处理用户已提出的具体需求');
    expect(summary.importantFacts).toEqual(['用户原始需求：替换 /compact 和自动压缩流程']);
  });

  it('resolves summary model config before invoking AI service', async (): Promise<void> => {
    const resolve = vi.fn().mockResolvedValue({
      createOptions: {
        providerId: 'openai',
        providerName: 'OpenAI',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        providerType: 'openai'
      },
      modelId: 'gpt-summary'
    });
    const generateText = vi.fn().mockResolvedValue([
      undefined,
      {
        text: JSON.stringify({
          goal: 'g',
          recentTopic: 'r',
          userPreferences: [],
          constraints: [],
          decisions: [],
          importantFacts: [],
          fileContext: [],
          openQuestions: [],
          pendingActions: []
        })
      }
    ]);
    const invoke = createRuntimeSummaryInvoke({ resolve }, generateText);

    const result = await invoke({ modelId: '', messages: [{ role: 'user', content: 'summarize' }] });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'openai' }),
      expect.objectContaining({ modelId: 'gpt-summary', messages: [{ role: 'user', content: 'summarize' }] })
    );
    expect(result.text).toContain('"goal":"g"');
  });
});

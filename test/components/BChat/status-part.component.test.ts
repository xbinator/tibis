/**
 * @file status-part.component.test.ts
 * @description BChat 统一状态片段组件测试。
 * @vitest-environment jsdom
 */
import type { ChatMessageCompactionPart } from 'types/chat';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BubblePartStatus from '@/components/BChat/components/MessageBubble/BubblePartStatus/index.vue';

/** 压缩状态与唯一可见文案。 */
const STATUS_LABELS = {
  pending: '上下文压缩中…',
  success: '上下文已压缩',
  failed: '上下文压缩失败',
  cancelled: '上下文压缩已取消',
  skipped: '当前上下文无需压缩'
} as const;

/**
 * 创建包含敏感内部字段的压缩片段。
 * @param status - 压缩生命周期状态
 * @returns 压缩片段
 */
function createCompactionPart(status: ChatMessageCompactionPart['status']): ChatMessageCompactionPart {
  return {
    id: `checkpoint-${status}`,
    type: 'compaction',
    status,
    trigger: 'manual',
    boundaryPartId: 'secret-boundary',
    sourceFingerprint: 'secret-fingerprint',
    modelSnapshot: {
      providerType: 'openai',
      providerId: 'secret-provider',
      modelId: 'secret-model',
      contextWindow: 100_000
    },
    budgetSnapshot: {
      outputReserve: 4_096,
      safetyReserve: 2_000,
      usableInputTokens: 93_904,
      triggerTokens: 80_000,
      targetTokens: 55_000,
      summaryMaxTokens: 12_000,
      rawTailMaxTokens: 43_000
    },
    errorCode: 'SECRET_ERROR_DETAIL',
    createdAt: 1
  };
}

/** 挂载统一状态片段。 */
function mountStatus(part?: ChatMessageCompactionPart): ReturnType<typeof mount> {
  return mount(BubblePartStatus, {
    props: { part }
  });
}

describe('BubblePartStatus', (): void => {
  it('renders the interrupt state without a compaction part', (): void => {
    const wrapper = mountStatus();

    expect(wrapper.text()).toBe('已中断');
    expect(wrapper.attributes('aria-live')).toBe('polite');
    expect(wrapper.attributes('role')).toBe('status');
  });

  it.each(Object.entries(STATUS_LABELS))('renders only the public compaction %s label', (status, expectedLabel): void => {
    const wrapper = mountStatus(createCompactionPart(status as ChatMessageCompactionPart['status']));

    expect(wrapper.text()).toBe(expectedLabel);
    expect(wrapper.attributes('aria-live')).toBe('polite');
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.html()).not.toMatch(/secret-boundary|secret-fingerprint|secret-provider|secret-model|SECRET_ERROR_DETAIL|100000|80000|55000/u);
  });
});

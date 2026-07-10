/**
 * @file widget-document-value.test.ts
 * @description BWidget 公开文档替换事务测试。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BWidget from '@/components/BWidget/index.vue';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/** Widget 视口尺寸观察器测试替身。 */
class ResizeObserverMock {
  /** 开始观察元素。 */
  observe(): void {
    return undefined;
  }

  /** 停止观察元素。 */
  disconnect(): void {
    return undefined;
  }

  /** 停止观察指定元素。 */
  unobserve(): void {
    return undefined;
  }
}

/** BWidget 对外暴露的文档替换控制器。 */
interface WidgetDocumentController {
  /** 通过画布历史替换完整 Widget 文档值。 */
  replaceDocumentValue: (value: WidgetData) => void;
}

/**
 * 创建可用于画布替换的 WidgetData。
 * @param elementId - 元素 ID
 * @param title - 元素标题
 * @returns Widget 文档数据
 */
function createWidgetData(elementId = 'element-1', title = '原始元素'): WidgetData {
  return {
    ...createDefaultWidgetData(),
    elements: [
      {
        id: elementId,
        name: 'rect',
        label: '矩形',
        icon: 'lucide:square',
        title,
        position: { x: 0, y: 0 },
        size: { width: 120, height: 80 },
        rotation: 0,
        style: {},
        loop: createDefaultWidgetElementLoopConfig(),
        metadata: {}
      }
    ]
  };
}

describe('BWidget document value transaction', (): void => {
  beforeEach((): void => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach((): void => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('replaces and emits the complete document value', async (): Promise<void> => {
    const wrapper = shallowMount(BWidget, {
      props: {
        value: createWidgetData()
      }
    });
    const replacement = {
      ...createWidgetData('element-2', 'AI 元素'),
      name: 'weather-next'
    };

    const controller = wrapper.vm as unknown as WidgetDocumentController;
    controller.replaceDocumentValue(replacement);
    await nextTick();

    expect(wrapper.emitted('update:value')?.at(-1)).toEqual([replacement]);
    wrapper.unmount();
  });
});

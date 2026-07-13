/**
 * @file use-runtime-layout.test.ts
 * @description 验证 BWidget 运行态展示布局随宿主宽度双向等比缩放。
 */
import type { ComputedRef, Ref } from 'vue';
import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { WidgetRuntimeDisplayLayout } from '@/components/BWidget/hooks/useRuntimeLayout';
import { useRuntimeLayout } from '@/components/BWidget/hooks/useRuntimeLayout';
import type { WidgetData, WidgetSize } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/**
 * 运行态布局测试选项。
 */
interface RuntimeLayoutTestOptions {
  /** Widget metadata */
  metadata?: WidgetData['metadata'];
  /** 内容边界尺寸 */
  contentSize?: WidgetSize;
  /** 宿主可用宽度 */
  hostWidth?: number;
  /** 是否存在可渲染元素 */
  hasRenderableElements?: boolean;
}

/**
 * 运行态布局测试上下文。
 */
interface RuntimeLayoutTestContext {
  /** 响应式宿主尺寸 */
  viewportSize: Ref<WidgetSize>;
  /** 运行态展示布局 */
  runtimeDisplayLayout: ComputedRef<WidgetRuntimeDisplayLayout>;
}

/**
 * 创建运行态布局测试上下文。
 * @param options - 布局测试选项
 * @returns 运行态布局响应式状态
 */
function createRuntimeLayoutTestContext(options: RuntimeLayoutTestOptions = {}): RuntimeLayoutTestContext {
  const viewportSize = ref<WidgetSize>({ width: options.hostWidth ?? 160, height: 0 });
  const { runtimeDisplayLayout } = useRuntimeLayout({
    widgetData: computed<WidgetData>(() => ({
      ...createDefaultWidgetData(),
      metadata: options.metadata ?? {}
    })),
    contentSize: computed<WidgetSize>(() => options.contentSize ?? { width: 200, height: 100 }),
    hasRenderableElements: computed<boolean>(() => options.hasRenderableElements ?? true),
    viewportSize
  });

  return {
    viewportSize,
    runtimeDisplayLayout
  };
}

describe('useRuntimeLayout', (): void => {
  it('scales a configured display box down and back up with the host width', (): void => {
    const { viewportSize, runtimeDisplayLayout } = createRuntimeLayoutTestContext({
      metadata: {
        width: 320,
        height: 180
      }
    });

    expect(runtimeDisplayLayout.value).toEqual({
      width: 160,
      height: 90,
      scale: 0.8,
      stageOffset: { x: 0, y: 5 }
    });

    viewportSize.value = { width: 320, height: 0 };

    expect(runtimeDisplayLayout.value).toEqual({
      width: 320,
      height: 180,
      scale: 1.6,
      stageOffset: { x: 0, y: 10 }
    });

    viewportSize.value = { width: 640, height: 0 };

    expect(runtimeDisplayLayout.value).toEqual({
      width: 640,
      height: 360,
      scale: 3.2,
      stageOffset: { x: 0, y: 20 }
    });
  });

  it('uses the content ratio when display metadata is not configured', (): void => {
    const { runtimeDisplayLayout } = createRuntimeLayoutTestContext({ hostWidth: 400 });

    expect(runtimeDisplayLayout.value).toEqual({
      width: 400,
      height: 200,
      scale: 2,
      stageOffset: { x: 0, y: 0 }
    });
  });

  it('uses configured width as the base size before fitting the host width', (): void => {
    const { runtimeDisplayLayout } = createRuntimeLayoutTestContext({
      metadata: { width: 320 },
      hostWidth: 640
    });

    expect(runtimeDisplayLayout.value).toEqual({
      width: 640,
      height: 320,
      scale: 3.2,
      stageOffset: { x: 0, y: 0 }
    });
  });

  it('uses configured height as the base size before fitting the host width', (): void => {
    const { runtimeDisplayLayout } = createRuntimeLayoutTestContext({
      metadata: { height: 180 },
      hostWidth: 720
    });

    expect(runtimeDisplayLayout.value).toEqual({
      width: 720,
      height: 360,
      scale: 3.6,
      stageOffset: { x: 0, y: 0 }
    });
  });

  it('keeps an empty runtime layout unscaled', (): void => {
    const { runtimeDisplayLayout } = createRuntimeLayoutTestContext({
      contentSize: { width: 0, height: 0 },
      hasRenderableElements: false,
      hostWidth: 640
    });

    expect(runtimeDisplayLayout.value).toEqual({
      height: 0,
      scale: 1,
      stageOffset: { x: 0, y: 0 }
    });
  });

  it('ignores invalid display metadata values', (): void => {
    const { runtimeDisplayLayout } = createRuntimeLayoutTestContext({
      metadata: {
        width: -10,
        height: Number.POSITIVE_INFINITY
      },
      hostWidth: 400
    });

    expect(runtimeDisplayLayout.value).toEqual({
      width: 400,
      height: 200,
      scale: 2,
      stageOffset: { x: 0, y: 0 }
    });
  });
});

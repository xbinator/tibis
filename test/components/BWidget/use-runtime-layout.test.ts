/**
 * @file use-runtime-layout.test.ts
 * @description 验证 BWidget 运行态展示布局随宿主宽度双向等比缩放。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  it('keeps runtime layout calculation in three focused functions', (): void => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/BWidget/hooks/useRuntimeLayout.ts'), 'utf8');

    expect(source).not.toContain('function normalizeRuntimeDisplaySizeValue');
    expect(source).not.toContain('function createCenteredStageOffset');
    expect(source).not.toContain('function createRuntimeBaseLayout');
    expect(source).not.toContain('function createResponsiveRuntimeDisplayLayout');
    expect(source).not.toContain('interface WidgetRuntimeBaseLayout');
  });

  it('scales a configured display box down and restores it without exceeding the configured size', (): void => {
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
      width: 320,
      height: 180,
      scale: 1.6,
      stageOffset: { x: 0, y: 10 }
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

  it('keeps configured width when the host is wider', (): void => {
    const { runtimeDisplayLayout } = createRuntimeLayoutTestContext({
      metadata: { width: 320 },
      hostWidth: 640
    });

    expect(runtimeDisplayLayout.value).toEqual({
      width: 320,
      height: 160,
      scale: 1.6,
      stageOffset: { x: 0, y: 0 }
    });
  });

  it('keeps configured height when the host is wider than its derived width', (): void => {
    const { runtimeDisplayLayout } = createRuntimeLayoutTestContext({
      metadata: { height: 180 },
      hostWidth: 720
    });

    expect(runtimeDisplayLayout.value).toEqual({
      width: 360,
      height: 180,
      scale: 1.8,
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

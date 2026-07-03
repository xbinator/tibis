/**
 * @file widget-text-metrics.test.ts
 * @description 验证 BWidget 文本元素尺寸测量与最大行数归一化逻辑。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetMetadata } from '@/components/BWidget/types';
import { createWidgetTextRenderSize, measureWidgetTextElementSize, readTextElementMaxLines } from '@/components/BWidget/utils/widgetTextMetrics';

/**
 * 创建测试用元素元数据。
 * @param maxLines - 最大行数覆盖值
 * @returns 元素元数据
 */
function createMetadata(maxLines?: number): WidgetMetadata {
  const metadata: WidgetMetadata = {};
  if (maxLines !== undefined) {
    metadata.maxLines = maxLines;
  }

  return metadata;
}

describe('readTextElementMaxLines', (): void => {
  it('returns undefined when metadata has no maxLines field', (): void => {
    expect(readTextElementMaxLines(createMetadata())).toBeUndefined();
  });

  it('returns undefined for non-positive or invalid values', (): void => {
    expect(readTextElementMaxLines(createMetadata(0))).toBeUndefined();
    expect(readTextElementMaxLines(createMetadata(-1))).toBeUndefined();
    expect(readTextElementMaxLines(createMetadata(Number.NaN))).toBeUndefined();
    expect(readTextElementMaxLines(createMetadata(Number.POSITIVE_INFINITY))).toBeUndefined();
  });

  it('returns undefined for non-number types', (): void => {
    const metadata = { maxLines: '3' } as unknown as WidgetMetadata;
    expect(readTextElementMaxLines(metadata)).toBeUndefined();
  });

  it('floors positive fractional values to integers', (): void => {
    expect(readTextElementMaxLines(createMetadata(1.5))).toBe(1);
    expect(readTextElementMaxLines(createMetadata(2.9))).toBe(2);
  });

  it('returns the integer value for positive numbers', (): void => {
    expect(readTextElementMaxLines(createMetadata(1))).toBe(1);
    expect(readTextElementMaxLines(createMetadata(3))).toBe(3);
    expect(readTextElementMaxLines(createMetadata(100))).toBe(100);
  });
});

describe('measureWidgetTextElementSize with maxLines', (): void => {
  /** 三行短文本，每行均不会触发软换行 */
  const threeLineText = '第一行\n第二行\n第三行';

  it('computes height for all lines when maxLines is not set', (): void => {
    const full = measureWidgetTextElementSize(threeLineText);

    expect(full.height).toBeGreaterThan(0);
    // 三行文本的高度应大于单行文本的高度
    const single = measureWidgetTextElementSize('仅一行');
    expect(full.height).toBeGreaterThan(single.height);
  });

  it('reduces height when maxLines truncates visible lines', (): void => {
    const full = measureWidgetTextElementSize(threeLineText);
    const truncated = measureWidgetTextElementSize(threeLineText, undefined, { maxLines: 2 });

    expect(truncated.height).toBeLessThan(full.height);
  });

  it('computes height for exactly maxLines lines when content exceeds', (): void => {
    const twoLines = measureWidgetTextElementSize('第一行\n第二行');
    const truncated = measureWidgetTextElementSize(threeLineText, undefined, { maxLines: 2 });

    // 截断到 2 行后，高度应与原生 2 行文本一致
    expect(truncated.height).toBe(twoLines.height);
  });

  it('does not truncate when maxLines exceeds actual line count', (): void => {
    const full = measureWidgetTextElementSize(threeLineText);
    const oversized = measureWidgetTextElementSize(threeLineText, undefined, { maxLines: 99 });

    expect(oversized.height).toBe(full.height);
  });

  it('treats non-positive maxLines as unlimited', (): void => {
    const full = measureWidgetTextElementSize(threeLineText);
    const zeroMax = measureWidgetTextElementSize(threeLineText, undefined, { maxLines: 0 });
    const negativeMax = measureWidgetTextElementSize(threeLineText, undefined, { maxLines: -3 });

    expect(zeroMax.height).toBe(full.height);
    expect(negativeMax.height).toBe(full.height);
  });

  it('computes width using only visible lines after truncation', (): void => {
    // 第二行明显长于第一行；maxLines=1 时宽度应按第一行计算
    const full = measureWidgetTextElementSize('短\n超长超长超长超长超长超长超长超长');
    const truncated = measureWidgetTextElementSize('短\n超长超长超长超长超长超长超长超长', undefined, { maxLines: 1 });

    expect(truncated.width).toBeLessThan(full.width);
  });
});

describe('createWidgetTextRenderSize with maxLines', (): void => {
  it('reads maxLines from element metadata when measuring content', (): void => {
    const renderSize = createWidgetTextRenderSize('content');
    const { measureContent } = renderSize;
    if (!measureContent) {
      throw new Error('measureContent should be defined');
    }

    const element = {
      id: 'text-1',
      name: 'text',
      label: '文本',
      icon: 'lucide:type',
      title: '文本',
      position: { x: 0, y: 0 },
      size: { width: 200, height: 50 },
      rotation: 0,
      style: {},
      metadata: { content: '第一行\n第二行\n第三行\n第四行', maxLines: 2 }
    };

    const truncated = measureContent(element as never);
    const elementFull = { ...element, metadata: { content: '第一行\n第二行\n第三行\n第四行' } };
    const full = measureContent(elementFull as never);

    expect(truncated.height).toBeLessThan(full.height);
  });
});

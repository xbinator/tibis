/**
 * @file drawing-runtime-layout.test.ts
 * @description 验证 BDrawing 运行态内容边界布局计算。
 */
import { describe, expect, it } from 'vitest';
import type { DrawingElement, DrawingPoint, DrawingRenderContext, DrawingSize } from '@/components/BDrawing/types';
import { createDrawingRuntimeLayout, type DrawingRuntimeElementLayout } from '@/components/BDrawing/utils/drawingRuntimeLayout';

/**
 * 创建矩形测试元素。
 * @param id - 元素 ID
 * @param position - 元素位置
 * @param size - 元素尺寸
 * @param rotation - 旋转角度
 * @returns 测试元素
 */
function createRectElement(id: string, position: DrawingPoint, size: DrawingSize, rotation = 0): DrawingElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: id,
    position,
    size,
    rotation,
    style: {},
    metadata: {}
  };
}

/**
 * 创建文本测试元素。
 * @param content - 文本模板
 * @returns 测试元素
 */
function createTextElement(content: string): DrawingElement {
  return {
    id: 'text-1',
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '天气文本',
    position: { x: 0, y: 0 },
    size: { width: 30, height: 12 },
    rotation: 0,
    style: {
      fontSize: 10
    },
    metadata: {
      content
    }
  };
}

describe('createDrawingRuntimeLayout', (): void => {
  it('uses rendered node bounds as the content container bounds', (): void => {
    const layout = createDrawingRuntimeLayout(
      [createRectElement('rect-1', { x: -20, y: 10 }, { width: 100, height: 40 }), createRectElement('rect-2', { x: 90, y: 30 }, { width: 40, height: 50 })],
      undefined,
      16
    );

    expect(layout.bounds).toEqual({
      minX: -20,
      minY: 10,
      maxX: 130,
      maxY: 80,
      width: 150,
      height: 70
    });
    expect(layout.contentSize).toEqual({
      width: 182,
      height: 102
    });
    expect(layout.offset).toEqual({
      x: 36,
      y: 6
    });
    const elementPositions = layout.elements.map((item: DrawingRuntimeElementLayout): { id: string; position: DrawingPoint } => ({
      id: item.element.id,
      position: item.position
    }));

    expect(elementPositions).toEqual([
      {
        id: 'rect-1',
        position: { x: 16, y: 16 }
      },
      {
        id: 'rect-2',
        position: { x: 126, y: 36 }
      }
    ]);
  });

  it('keeps rotated nodes inside the content bounds', (): void => {
    const layout = createDrawingRuntimeLayout([createRectElement('rect-1', { x: 0, y: 0 }, { width: 40, height: 20 }, 90)], undefined, 10);

    expect(layout.bounds).toEqual({
      minX: 10,
      minY: -10,
      maxX: 30,
      maxY: 30,
      width: 20,
      height: 40
    });
    expect(layout.contentSize).toEqual({
      width: 40,
      height: 60
    });
    expect(layout.offset).toEqual({
      x: 0,
      y: 20
    });
    expect(layout.elements[0].position).toEqual({
      x: 0,
      y: 20
    });
  });

  it('uses render context when measuring dynamic text nodes', (): void => {
    const compactContext: DrawingRenderContext = {
      input: {
        city: '沪'
      },
      state: {}
    };
    const expandedContext: DrawingRenderContext = {
      input: {
        city: '上海浦东新区'
      },
      state: {}
    };
    const compactLayout = createDrawingRuntimeLayout([createTextElement('{{ input.city }}')], compactContext);
    const expandedLayout = createDrawingRuntimeLayout([createTextElement('{{ input.city }}')], expandedContext);

    expect(expandedLayout.bounds.height).toBeGreaterThan(compactLayout.bounds.height);
  });

  it('returns a minimal empty layout when there are no visible nodes', (): void => {
    const layout = createDrawingRuntimeLayout([], undefined, 16);

    expect(layout.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0
    });
    expect(layout.contentSize).toEqual({
      width: 1,
      height: 1
    });
    expect(layout.offset).toEqual({
      x: 0,
      y: 0
    });
    expect(layout.elements).toEqual([]);
  });
});

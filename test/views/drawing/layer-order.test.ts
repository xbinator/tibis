/**
 * @file layer-order.test.ts
 * @description 验证画图侧栏图层视觉顺序与数据顺序的换算。
 */
import { describe, expect, it } from 'vitest';
import type { DrawingElement } from '@/components/BDrawing/types';
import { reorderDrawingLayerElementsByDisplayPosition } from '@/views/drawing/utils/layerOrder';

/**
 * 创建排序测试用画图元素。
 * @param id - 元素 ID
 * @returns 画图元素
 */
function createElement(id: string): DrawingElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: id,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 80 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 读取元素 ID 顺序。
 * @param elements - 画图元素列表
 * @returns 元素 ID 列表
 */
function getElementIds(elements: DrawingElement[]): string[] {
  return elements.map((element: DrawingElement): string => element.id);
}

describe('layerOrder', (): void => {
  it('moves a lower data item before the visual top layer', (): void => {
    const elements = [createElement('node-1'), createElement('node-2'), createElement('node-3')];

    const nextElements = reorderDrawingLayerElementsByDisplayPosition(elements, 'node-1', 'node-3', 'before');

    expect(getElementIds(nextElements)).toEqual(['node-2', 'node-3', 'node-1']);
  });

  it('moves the visual top layer after the visual bottom layer', (): void => {
    const elements = [createElement('node-1'), createElement('node-2'), createElement('node-3')];

    const nextElements = reorderDrawingLayerElementsByDisplayPosition(elements, 'node-3', 'node-1', 'after');

    expect(getElementIds(nextElements)).toEqual(['node-3', 'node-1', 'node-2']);
  });

  it('keeps the original list when the source and target are invalid', (): void => {
    const elements = [createElement('node-1'), createElement('node-2')];

    expect(reorderDrawingLayerElementsByDisplayPosition(elements, 'node-1', 'node-1', 'before')).toBe(elements);
    expect(reorderDrawingLayerElementsByDisplayPosition(elements, 'missing', 'node-1', 'before')).toBe(elements);
    expect(reorderDrawingLayerElementsByDisplayPosition(elements, 'node-1', 'missing', 'after')).toBe(elements);
  });

  it('keeps the original list when the requested move does not change the visual order', (): void => {
    const elements = [createElement('node-1'), createElement('node-2'), createElement('node-3')];

    expect(reorderDrawingLayerElementsByDisplayPosition(elements, 'node-3', 'node-2', 'before')).toBe(elements);
    expect(reorderDrawingLayerElementsByDisplayPosition(elements, 'node-1', 'node-2', 'after')).toBe(elements);
  });
});

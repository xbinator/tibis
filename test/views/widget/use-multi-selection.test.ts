/**
 * @file use-multi-selection.test.ts
 * @description 验证Widget页面多选布局和样式批量处理逻辑。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetElement } from '@/components/BWidget/types';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';
import { findWidgetElementTreeNode } from '@/components/BWidget/utils/widgetTree';
import { mergeSelectedElementStyles, updateSelectedElementLayouts } from '@/views/widget/hooks/useMultiSelection';

/**
 * 创建多选测试元素。
 * @param id - 元素 ID
 * @param position - 元素位置
 * @param size - 元素尺寸
 * @param locked - 是否锁定几何属性
 * @returns Widget元素
 */
function createElement(id: string, position: WidgetElement['position'], size: WidgetElement['size'], locked = false): WidgetElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: id,
    position,
    size,
    rotation: 0,
    style: {},
    locked,
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {}
  };
}

describe('useMultiSelection', (): void => {
  it('scales selected unlocked elements from the multi-selection bounds', (): void => {
    const elements = [
      createElement('node-1', { x: 0, y: 0 }, { width: 10, height: 20 }),
      createElement('node-2', { x: 10, y: 0 }, { width: 10, height: 20 }, true)
    ];

    const nextElements = updateSelectedElementLayouts(elements, new Set(['node-1', 'node-2']), {
      x: 5,
      y: 10,
      width: 40,
      height: 20
    });

    expect(findWidgetElementTreeNode(nextElements, 'node-1')?.element.position).toEqual({ x: 5, y: 10 });
    expect(findWidgetElementTreeNode(nextElements, 'node-1')?.element.size).toEqual({ width: 20, height: 20 });
    expect(findWidgetElementTreeNode(nextElements, 'node-2')?.element.position).toEqual({ x: 10, y: 0 });
    expect(findWidgetElementTreeNode(nextElements, 'node-2')?.element.size).toEqual({ width: 10, height: 20 });
  });

  it('merges style changes into selected elements only', (): void => {
    const elements = [createElement('node-1', { x: 0, y: 0 }, { width: 10, height: 20 }), createElement('node-2', { x: 30, y: 0 }, { width: 10, height: 20 })];

    const nextElements = mergeSelectedElementStyles(elements, new Set(['node-1']), {
      color: '#111827',
      fontSize: 16
    });

    expect(findWidgetElementTreeNode(nextElements, 'node-1')?.element.style).toEqual({
      color: '#111827',
      fontSize: 16
    });
    expect(findWidgetElementTreeNode(nextElements, 'node-2')?.element.style).toEqual({});
  });
});

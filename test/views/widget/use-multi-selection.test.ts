/**
 * @file use-multi-selection.test.ts
 * @description 验证Widget页面多选与图层操作的数据更新逻辑。
 */
import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { WidgetData, WidgetElement, WidgetSelectTarget } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';
import { findElementTreeNode } from '@/components/BWidget/utils/widgetTree';
import type { WidgetComponentRef, WidgetDataSession } from '@/views/widget/hooks/types';
import { useLayerActions } from '@/views/widget/hooks/useLayerActions';
import { mergeSelectedElementStyles, updateSelectedElementLayouts, useMultiSelection } from '@/views/widget/hooks/useMultiSelection';

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
  it('keeps the widget data root when applying multi styles', (): void => {
    const data = ref<WidgetData>({
      ...createDefaultWidgetData(),
      elements: [createElement('node-1', { x: 0, y: 0 }, { width: 10, height: 20 }), createElement('node-2', { x: 30, y: 0 }, { width: 10, height: 20 })]
    });
    const session: WidgetDataSession = { data };
    const initialData = data.value;
    const handlers = useMultiSelection({
      session,
      selectedElementIds: ref<string[]>(['node-1', 'node-2']),
      widgetRef: ref<WidgetComponentRef>()
    });

    handlers.onMultiStyleChange({ color: '#111827' });

    expect(data.value).toBe(initialData);
    expect(data.value.elements.every((element: WidgetElement): boolean => element.style.color === '#111827')).toBe(true);
  });

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

    expect(findElementTreeNode(nextElements, 'node-1')?.element.position).toEqual({ x: 5, y: 10 });
    expect(findElementTreeNode(nextElements, 'node-1')?.element.size).toEqual({ width: 20, height: 20 });
    expect(findElementTreeNode(nextElements, 'node-2')?.element.position).toEqual({ x: 10, y: 0 });
    expect(findElementTreeNode(nextElements, 'node-2')?.element.size).toEqual({ width: 10, height: 20 });
  });

  it('merges style changes into selected elements only', (): void => {
    const elements = [createElement('node-1', { x: 0, y: 0 }, { width: 10, height: 20 }), createElement('node-2', { x: 30, y: 0 }, { width: 10, height: 20 })];

    const nextElements = mergeSelectedElementStyles(elements, new Set(['node-1']), {
      color: '#111827',
      fontSize: 16
    });

    expect(findElementTreeNode(nextElements, 'node-1')?.element.style).toEqual({
      color: '#111827',
      fontSize: 16
    });
    expect(findElementTreeNode(nextElements, 'node-2')?.element.style).toEqual({});
  });
});

describe('useLayerActions', (): void => {
  it('keeps the widget data root when removing a layer', (): void => {
    const first = createElement('node-1', { x: 0, y: 0 }, { width: 120, height: 80 });
    const second = createElement('node-2', { x: 140, y: 0 }, { width: 120, height: 80 });
    const data = ref<WidgetData>({ ...createDefaultWidgetData(), elements: [first, second] });
    const session: WidgetDataSession = { data };
    const initialData = data.value;
    const layer = useLayerActions({
      session,
      selectedTarget: ref<WidgetSelectTarget>(first),
      selectedElementIds: ref<string[]>(['node-1']),
      widgetRef: ref<WidgetComponentRef>()
    });

    layer.remove([first]);

    expect(data.value).toBe(initialData);
    expect(data.value.elements.map((element: WidgetElement): string => element.id)).toEqual(['node-2']);
  });
});

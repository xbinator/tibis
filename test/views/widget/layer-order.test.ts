/**
 * @file layer-order.test.ts
 * @description 验证Widget 侧栏图层视觉顺序与数据顺序的换算。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetElement } from '@/components/BWidget/types';
import { reorderWidgetLayerElementGroupsByDisplayPosition, reorderWidgetLayerElementsByDisplayPosition } from '@/views/widget/utils/layerOrder';

/**
 * 创建排序测试用Widget 元素。
 * @param id - 元素 ID
 * @returns Widget 元素
 */
function createElement(id: string, position: WidgetElement['position'] = { x: 0, y: 0 }): WidgetElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: id,
    position,
    size: { width: 100, height: 80 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 创建排序测试用组合元素。
 * @param id - 组合 ID
 * @param children - 子元素列表
 * @returns Widget 组合元素
 */
function createGroupElement(id: string, children: WidgetElement[]): WidgetElement {
  return {
    ...createElement(id),
    name: 'group',
    label: '组合',
    icon: 'lucide:group',
    children
  };
}

/**
 * 读取元素 ID 顺序。
 * @param elements - Widget 元素列表
 * @returns 元素 ID 列表
 */
function getElementIds(elements: WidgetElement[]): string[] {
  return elements.map((element: WidgetElement): string => element.id);
}

/**
 * 读取组合子元素 ID 顺序。
 * @param element - 组合元素
 * @returns 子元素 ID 列表
 */
function getChildIds(element: WidgetElement | undefined): string[] {
  return element?.children?.map((child: WidgetElement): string => child.id) ?? [];
}

describe('layerOrder', (): void => {
  it('moves a lower data item before the visual top layer', (): void => {
    const elements = [createElement('node-1'), createElement('node-2'), createElement('node-3')];

    const nextElements = reorderWidgetLayerElementsByDisplayPosition(elements, 'node-1', 'node-3', 'before');

    expect(getElementIds(nextElements)).toEqual(['node-2', 'node-3', 'node-1']);
  });

  it('moves the visual top layer after the visual bottom layer', (): void => {
    const elements = [createElement('node-1'), createElement('node-2'), createElement('node-3')];

    const nextElements = reorderWidgetLayerElementsByDisplayPosition(elements, 'node-3', 'node-1', 'after');

    expect(getElementIds(nextElements)).toEqual(['node-3', 'node-1', 'node-2']);
  });

  it('keeps the original list when the source and target are invalid', (): void => {
    const elements = [createElement('node-1'), createElement('node-2')];

    expect(reorderWidgetLayerElementsByDisplayPosition(elements, 'node-1', 'node-1', 'before')).toBe(elements);
    expect(reorderWidgetLayerElementsByDisplayPosition(elements, 'missing', 'node-1', 'before')).toBe(elements);
    expect(reorderWidgetLayerElementsByDisplayPosition(elements, 'node-1', 'missing', 'after')).toBe(elements);
  });

  it('keeps the original list when the requested move does not change the visual order', (): void => {
    const elements = [createElement('node-1'), createElement('node-2'), createElement('node-3')];

    expect(reorderWidgetLayerElementsByDisplayPosition(elements, 'node-3', 'node-2', 'before')).toBe(elements);
    expect(reorderWidgetLayerElementsByDisplayPosition(elements, 'node-1', 'node-2', 'after')).toBe(elements);
  });

  it('moves grouped layers as a single visual block', (): void => {
    const elements = [createElement('node-1'), createElement('node-2'), createElement('node-3')];

    const nextElements = reorderWidgetLayerElementGroupsByDisplayPosition(elements, ['node-1', 'node-2'], ['node-3'], 'before');

    expect(getElementIds(nextElements)).toEqual(['node-3', 'node-1', 'node-2']);
  });

  it('moves nested child layers inside their direct parent only', (): void => {
    const elements = [
      createGroupElement('group-1', [createElement('child-1'), createElement('child-2'), createElement('child-3')]),
      createElement('node-1')
    ];

    const nextElements = reorderWidgetLayerElementsByDisplayPosition(elements, 'child-1', 'child-3', 'before');

    expect(getElementIds(nextElements)).toEqual(['group-1', 'node-1']);
    expect(getChildIds(nextElements[0])).toEqual(['child-2', 'child-3', 'child-1']);
  });

  it('moves a child layer out next to a top-level target', (): void => {
    const elements = [createGroupElement('group-1', [createElement('child-1'), createElement('child-2')]), createElement('node-1')];

    const nextElements = reorderWidgetLayerElementsByDisplayPosition(elements, 'child-1', 'node-1', 'before');

    expect(getElementIds(nextElements)).toEqual(['group-1', 'node-1', 'child-1']);
    expect(getChildIds(nextElements[0])).toEqual(['child-2']);
  });

  it('removes the source group when moving its last child out', (): void => {
    const elements = [createGroupElement('group-1', [createElement('child-1')]), createElement('node-1')];

    const nextElements = reorderWidgetLayerElementsByDisplayPosition(elements, 'child-1', 'node-1', 'before');

    expect(getElementIds(nextElements)).toEqual(['node-1', 'child-1']);
  });

  it('moves nested sibling blocks inside their direct parent only', (): void => {
    const elements = [createGroupElement('group-1', [createElement('child-1'), createElement('child-2'), createElement('child-3')])];

    const nextElements = reorderWidgetLayerElementGroupsByDisplayPosition(elements, ['child-1', 'child-2'], ['child-3'], 'before');

    expect(getChildIds(nextElements[0])).toEqual(['child-3', 'child-1', 'child-2']);
  });

  it('moves a top-level layer inside a group while preserving its absolute position', (): void => {
    const group = createGroupElement('group-1', [createElement('child-1')]);
    group.position = { x: 10, y: 16 };
    const elements = [group, createElement('node-1', { x: 40, y: 56 })];

    const nextElements = reorderWidgetLayerElementsByDisplayPosition(elements, 'node-1', 'group-1', 'inside');

    expect(getElementIds(nextElements)).toEqual(['group-1']);
    expect(getChildIds(nextElements[0])).toEqual(['child-1', 'node-1']);
    expect(nextElements[0]?.children?.[1]?.position).toEqual({ x: 30, y: 40 });
  });

  it('keeps the tree unchanged when moving a group into its own descendant', (): void => {
    const elements = [createGroupElement('group-1', [createGroupElement('group-2', [createElement('child-1')])])];

    const nextElements = reorderWidgetLayerElementsByDisplayPosition(elements, 'group-1', 'group-2', 'inside');

    expect(nextElements).toBe(elements);
  });
});

/**
 * @file widget-tree.test.ts
 * @description BWidget 元素树工具测试。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetElement } from '@/components/BWidget/types';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';
import {
  findElementTreeNode,
  flattenWidgetElementTree,
  getAbsolutePosition,
  getLocalPosition,
  isSameParent,
  isWidgetGroupElement,
  removeEmptyWidgetGroups,
  removeElementFromTree,
  replaceSiblingList,
  updateElementInTree
} from '@/components/BWidget/utils/widgetTree';

/**
 * 创建测试用 Widget 元素。
 * @param id - 元素 ID
 * @param x - 相对父级横坐标
 * @param y - 相对父级纵坐标
 * @param children - 子元素列表
 * @returns Widget 元素
 */
function createElement(id: string, x: number, y: number, children?: WidgetElement[]): WidgetElement {
  return {
    id,
    name: children ? 'group' : 'rect',
    label: children ? '组合' : '矩形',
    icon: children ? 'lucide:group' : 'lucide:square',
    title: id,
    position: { x, y },
    size: { width: 100, height: 80 },
    rotation: 0,
    style: {},
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {},
    ...(children ? { children } : {})
  };
}

describe('widgetTree', (): void => {
  it('flattens nested elements with absolute positions', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('child-1', 16, 12)])];
    const flat = flattenWidgetElementTree(elements);

    expect(flat.map((item) => [item.element.id, item.parentId, item.absolutePosition])).toEqual([
      ['group-1', null, { x: 100, y: 80 }],
      ['child-1', 'group-1', { x: 116, y: 92 }]
    ]);
  });

  it('finds and updates nested elements without changing siblings', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('child-1', 16, 12), createElement('child-2', 24, 20)])];
    const found = findElementTreeNode(elements, 'child-1');
    const updated = updateElementInTree(elements, 'child-1', (element: WidgetElement): WidgetElement => ({ ...element, title: '更新' }));

    expect(found?.path).toEqual(['group-1', 'child-1']);
    expect(findElementTreeNode(updated, 'child-1')?.element.title).toBe('更新');
    expect(findElementTreeNode(updated, 'child-2')?.element.title).toBe('child-2');
  });

  it('removes nested elements from their direct parent', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('child-1', 16, 12), createElement('child-2', 24, 20)])];
    const result = removeElementFromTree(elements, 'child-1');

    expect(result.removed?.id).toBe('child-1');
    expect(findElementTreeNode(result.elements, 'child-1')).toBeNull();
    expect(findElementTreeNode(result.elements, 'child-2')).not.toBeNull();
  });

  it('removes empty groups recursively', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('group-2', 16, 12, [])]), createElement('node-1', 0, 0)];

    const nextElements = removeEmptyWidgetGroups(elements);

    expect(nextElements.map((element: WidgetElement): string => element.id)).toEqual(['node-1']);
  });

  it('detects group elements by name only', (): void => {
    expect(isWidgetGroupElement(createElement('group-1', 0, 0, []))).toBe(true);
    expect(isWidgetGroupElement(createElement('rect-1', 0, 0))).toBe(false);
  });

  it('calculates absolute position from a nested tree node', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('group-2', 20, 10, [createElement('child-1', 5, 6)])])];

    expect(getAbsolutePosition(elements, 'child-1')).toEqual({ x: 125, y: 96 });
  });

  it('converts board positions into a parent local coordinate system', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('group-2', 20, 10, [createElement('child-1', 5, 6)])])];

    expect(getLocalPosition(elements, 'group-2', { x: 140, y: 120 })).toEqual({ x: 20, y: 30 });
    expect(getLocalPosition(elements, null, { x: 140, y: 120 })).toEqual({ x: 140, y: 120 });
  });

  it('replaces a direct sibling list without touching other branches', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('child-1', 16, 12), createElement('child-2', 24, 20)]), createElement('top-1', 0, 0)];
    const replaced = replaceSiblingList(elements, 'group-1', [createElement('child-3', 32, 28)]);
    const group = findElementTreeNode(replaced, 'group-1')?.element;

    expect(group?.children?.map((element: WidgetElement): string => element.id)).toEqual(['child-3']);
    expect(findElementTreeNode(replaced, 'top-1')).not.toBeNull();
  });

  it('checks whether elements share the same direct parent', (): void => {
    const elements = [createElement('top-1', 0, 0), createElement('group-1', 100, 80, [createElement('child-1', 16, 12), createElement('child-2', 24, 20)])];

    expect(isSameParent(elements, ['child-1', 'child-2'])).toBe(true);
    expect(isSameParent(elements, ['top-1', 'child-1'])).toBe(false);
  });
});

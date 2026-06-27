/**
 * @file utils.test.ts
 * @description 验证 BDraggable 公共拖拽排序工具函数。
 */
import { describe, expect, it } from 'vitest';
import type { BDraggableItemRect } from '@/components/BDraggable/types';
import { isBDraggableDragData, reorderDraggableList, resolveDraggableIndicatorOffset, resolveDraggablePlacement } from '@/components/BDraggable/utils';

/**
 * 测试列表项。
 */
interface TestItem {
  /** 唯一标识 */
  id: string;
  /** 显示标题 */
  title: string;
}

/** 测试列表。 */
const testItems: TestItem[] = [
  { id: 'node-1', title: '节点 1' },
  { id: 'node-2', title: '节点 2' },
  { id: 'node-3', title: '节点 3' }
];

/**
 * 读取测试项 key。
 * @param item - 测试项
 * @returns 测试项 ID
 */
function getItemKey(item: TestItem): string {
  return item.id;
}

/**
 * 读取测试项 ID 顺序。
 * @param items - 测试项列表
 * @returns ID 列表
 */
function getItemIds(items: TestItem[]): string[] {
  return items.map((item: TestItem): string => item.id);
}

describe('BDraggable utils', (): void => {
  it('reorders a list by visual before and after positions', (): void => {
    expect(getItemIds(reorderDraggableList(testItems, 'node-1', 'node-3', 'before', getItemKey))).toEqual(['node-2', 'node-1', 'node-3']);
    expect(getItemIds(reorderDraggableList(testItems, 'node-3', 'node-1', 'after', getItemKey))).toEqual(['node-1', 'node-3', 'node-2']);
  });

  it('returns the original list for invalid move requests', (): void => {
    expect(reorderDraggableList(testItems, 'node-1', 'node-1', 'before', getItemKey)).toBe(testItems);
    expect(reorderDraggableList(testItems, 'missing', 'node-1', 'before', getItemKey)).toBe(testItems);
    expect(reorderDraggableList(testItems, 'node-1', 'missing', 'after', getItemKey)).toBe(testItems);
  });

  it('returns the original list when the requested move keeps the same visual order', (): void => {
    expect(reorderDraggableList(testItems, 'node-1', 'node-2', 'before', getItemKey)).toBe(testItems);
    expect(reorderDraggableList(testItems, 'node-3', 'node-2', 'after', getItemKey)).toBe(testItems);
  });

  it('resolves a vertical top boundary as before the first item', (): void => {
    const rects: BDraggableItemRect[] = [
      { key: 'node-3', start: 0, size: 32 },
      { key: 'node-2', start: 38, size: 32 },
      { key: 'node-1', start: 76, size: 32 }
    ];

    expect(
      resolveDraggablePlacement({
        pointerPosition: -4,
        itemRects: rects,
        sourceKey: 'node-1',
        targetKey: null,
        targetEdge: null,
        direction: 'vertical'
      })
    ).toEqual({ targetKey: 'node-3', position: 'before' });
  });

  it('resolves the upper half of the visual first item as before when edge data is missing', (): void => {
    const rects: BDraggableItemRect[] = [
      { key: 'node-3', start: 0, size: 32 },
      { key: 'node-2', start: 38, size: 32 },
      { key: 'node-1', start: 76, size: 32 }
    ];

    expect(
      resolveDraggablePlacement({
        pointerPosition: 8,
        itemRects: rects,
        sourceKey: 'node-1',
        targetKey: 'node-3',
        targetEdge: null,
        direction: 'vertical'
      })
    ).toEqual({ targetKey: 'node-3', position: 'before' });
  });

  it('resolves the visual first position when there is no active drop target', (): void => {
    const rects: BDraggableItemRect[] = [
      { key: 'node-3', start: 0, size: 32 },
      { key: 'node-2', start: 38, size: 32 },
      { key: 'node-1', start: 76, size: 32 }
    ];

    expect(
      resolveDraggablePlacement({
        pointerPosition: 8,
        itemRects: rects,
        sourceKey: 'node-1',
        targetKey: null,
        targetEdge: null,
        direction: 'vertical'
      })
    ).toEqual({ targetKey: 'node-3', position: 'before' });
  });

  it('maps horizontal hitbox edges to before and after positions', (): void => {
    const rects: BDraggableItemRect[] = [
      { key: 'tab-1', start: 0, size: 120 },
      { key: 'tab-2', start: 128, size: 120 }
    ];

    expect(
      resolveDraggablePlacement({
        pointerPosition: 150,
        itemRects: rects,
        sourceKey: 'tab-1',
        targetKey: 'tab-2',
        targetEdge: 'left',
        direction: 'horizontal'
      })
    ).toEqual({ targetKey: 'tab-2', position: 'before' });
  });

  it('centers the indicator between adjacent items when the list has a gap', (): void => {
    const rects: BDraggableItemRect[] = [
      { key: 'node-1', start: 0, size: 32 },
      { key: 'node-2', start: 44, size: 32 }
    ];

    expect(resolveDraggableIndicatorOffset({ itemRects: rects, targetKey: 'node-1', position: 'after' })).toBe(38);
    expect(resolveDraggableIndicatorOffset({ itemRects: rects, targetKey: 'node-2', position: 'before' })).toBe(38);
    expect(resolveDraggableIndicatorOffset({ itemRects: rects, targetKey: 'node-1', position: 'before' })).toBe(0);
    expect(resolveDraggableIndicatorOffset({ itemRects: rects, targetKey: 'node-2', position: 'after' })).toBe(76);
  });

  it('recognizes only BDraggable drag payloads', (): void => {
    expect(isBDraggableDragData({ bDraggableKey: 'node-1' })).toBe(true);
    expect(isBDraggableDragData({ tabId: 'tab-1' })).toBe(false);
  });
});

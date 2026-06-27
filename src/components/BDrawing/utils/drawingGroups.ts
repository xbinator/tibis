/**
 * @file drawingGroups.ts
 * @description BDrawing 元素组合元数据读取与选区扩展工具。
 */
import type { DrawingElement } from '../types';

/** 元素组合 ID 在 metadata 中使用的字段名。 */
export const DRAWING_GROUP_METADATA_KEY = 'groupId';

/**
 * 读取元素所属组合 ID。
 * @param element - 画板元素
 * @returns 组合 ID，不属于组合时返回 null
 */
export function getDrawingElementGroupId(element: Pick<DrawingElement, 'metadata'>): string | null {
  const groupId = element.metadata[DRAWING_GROUP_METADATA_KEY];

  return typeof groupId === 'string' && groupId.length > 0 ? groupId : null;
}

/**
 * 读取选区命中的组合 ID 集合。
 * @param elements - 画板元素列表
 * @param selection - 当前选区 ID 列表
 * @returns 组合 ID 集合
 */
export function getDrawingSelectionGroupIds(elements: DrawingElement[], selection: string[]): Set<string> {
  const selectedIds = new Set(selection);
  const groupIds = new Set<string>();

  elements.forEach((element: DrawingElement): void => {
    if (!selectedIds.has(element.id)) {
      return;
    }

    const groupId = getDrawingElementGroupId(element);
    if (groupId) {
      groupIds.add(groupId);
    }
  });

  return groupIds;
}

/**
 * 将命中组合成员的选区扩展为完整组合选区。
 * @param elements - 画板元素列表
 * @param selection - 当前选区 ID 列表
 * @returns 扩展后的选区 ID 列表
 */
export function expandDrawingSelectionToGroups(elements: DrawingElement[], selection: string[]): string[] {
  const selectedIds = new Set(selection);
  const groupIds = getDrawingSelectionGroupIds(elements, selection);

  if (groupIds.size === 0) {
    return elements.filter((element: DrawingElement): boolean => selectedIds.has(element.id)).map((element: DrawingElement): string => element.id);
  }

  return elements
    .filter((element: DrawingElement): boolean => {
      const groupId = getDrawingElementGroupId(element);

      return selectedIds.has(element.id) || (groupId !== null && groupIds.has(groupId));
    })
    .map((element: DrawingElement): string => element.id);
}

/**
 * 判断选区是否命中了已组合元素。
 * @param elements - 画板元素列表
 * @param selection - 当前选区 ID 列表
 * @returns 是否命中组合元素
 */
export function hasDrawingGroupedSelection(elements: DrawingElement[], selection: string[]): boolean {
  return getDrawingSelectionGroupIds(elements, selection).size > 0;
}

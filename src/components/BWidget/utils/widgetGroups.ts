/**
 * @file widgetGroups.ts
 * @description BWidget 元素组合元数据读取与选区扩展工具。
 */
import type { WidgetElement } from '../types';

/** 元素组合 ID 在 metadata 中使用的字段名。 */
export const WIDGET_GROUP_METADATA_KEY = 'groupId';

/**
 * 读取元素所属组合 ID。
 * @param element - Widget元素
 * @returns 组合 ID，不属于组合时返回 null
 */
export function getWidgetElementGroupId(element: Pick<WidgetElement, 'metadata'>): string | null {
  const groupId = element.metadata[WIDGET_GROUP_METADATA_KEY];

  return typeof groupId === 'string' && groupId.length > 0 ? groupId : null;
}

/**
 * 读取选区命中的组合 ID 集合。
 * @param elements - Widget元素列表
 * @param selection - 当前选区 ID 列表
 * @returns 组合 ID 集合
 */
export function getWidgetSelectionGroupIds(elements: WidgetElement[], selection: string[]): Set<string> {
  const selectedIds = new Set(selection);
  const groupIds = new Set<string>();

  elements.forEach((element: WidgetElement): void => {
    if (!selectedIds.has(element.id)) {
      return;
    }

    const groupId = getWidgetElementGroupId(element);
    if (groupId) {
      groupIds.add(groupId);
    }
  });

  return groupIds;
}

/**
 * 将命中组合成员的选区扩展为完整组合选区。
 * @param elements - Widget元素列表
 * @param selection - 当前选区 ID 列表
 * @returns 扩展后的选区 ID 列表
 */
export function expandWidgetSelectionToGroups(elements: WidgetElement[], selection: string[]): string[] {
  const selectedIds = new Set(selection);
  const groupIds = getWidgetSelectionGroupIds(elements, selection);

  if (groupIds.size === 0) {
    return elements.filter((element: WidgetElement): boolean => selectedIds.has(element.id)).map((element: WidgetElement): string => element.id);
  }

  return elements
    .filter((element: WidgetElement): boolean => {
      const groupId = getWidgetElementGroupId(element);

      return selectedIds.has(element.id) || (groupId !== null && groupIds.has(groupId));
    })
    .map((element: WidgetElement): string => element.id);
}

/**
 * 判断选区是否命中了已组合元素。
 * @param elements - Widget元素列表
 * @param selection - 当前选区 ID 列表
 * @returns 是否命中组合元素
 */
export function hasWidgetGroupedSelection(elements: WidgetElement[], selection: string[]): boolean {
  return getWidgetSelectionGroupIds(elements, selection).size > 0;
}

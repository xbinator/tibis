/**
 * @file useMultiSelection.ts
 * @description Widget页面多选设置面板命令、布局和样式批量处理逻辑。
 */
import type { WidgetMultiSelectLayoutChange } from '../types';
import type { WidgetComponentRef } from './types';
import type { Ref } from 'vue';
import type { WidgetData, WidgetElement, WidgetElementStyleChange, WidgetLayerAction } from '@/components/BWidget/types';
import { flattenWidgetElementTree, isSameParent, updateElementInTree, type WidgetRenderTreeNode } from '@/components/BWidget/utils/widgetTree';
import type { UseFileSessionReturn } from '@/hooks/useFileSession';

/**
 * 右侧多选面板快捷操作命令。
 */
export type SettingsMultiCommand = 'copy' | 'group' | 'ungroup' | WidgetLayerAction | 'delete';

/**
 * 右侧单元素专属快捷操作命令。
 */
export type SettingsElementCommand = 'ungroup';

/**
 * 多选外接框布局信息。
 */
export interface MultiSelectionBounds {
  /** 外接框左上横坐标 */
  x: number;
  /** 外接框左上纵坐标 */
  y: number;
  /** 外接框宽度 */
  width: number;
  /** 外接框高度 */
  height: number;
}

/**
 * Widget多选 hook 入参。
 */
export interface UseMultiSelectionOptions {
  /** 当前Widget文件会话 */
  session: UseFileSessionReturn<WidgetData>;
  /** 当前选中元素 ID 列表 */
  selectedElementIds: Ref<string[]>;
  /** Widget画布组件引用 */
  widgetRef: Ref<WidgetComponentRef | undefined>;
}

/**
 * Widget多选 hook 返回值（扁平结构）。
 */
export interface UseMultiSelectionReturn {
  /** 处理右侧多选快捷命令 */
  onMultiCommand: (payload: { command: SettingsMultiCommand }) => void;
  /** 处理右侧元素快捷命令 */
  onElementCommand: (payload: { command: SettingsElementCommand }) => void;
  /** 处理右侧多选布局变更 */
  onMultiLayoutChange: (layout: WidgetMultiSelectLayoutChange) => void;
  /** 处理右侧多选样式变更 */
  onMultiStyleChange: (style: WidgetElementStyleChange) => void;
}

/**
 * 创建多选元素外接框。
 * @param elements - 目标多选元素列表
 * @returns 多选元素外接框，空列表返回 null
 */
export function createMultiSelectionBounds(elements: WidgetElement[]): MultiSelectionBounds | null {
  if (elements.length === 0) {
    return null;
  }

  const left = Math.min(...elements.map((element: WidgetElement): number => element.position.x));
  const top = Math.min(...elements.map((element: WidgetElement): number => element.position.y));
  const right = Math.max(...elements.map((element: WidgetElement): number => element.position.x + element.size.width));
  const bottom = Math.max(...elements.map((element: WidgetElement): number => element.position.y + element.size.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

/**
 * 规范化布局数值，避免浮点缩放产生过长小数。
 * @param value - 原始布局数值
 * @returns 规范化后的布局数值
 */
export function normalizeMultiSelectLayoutValue(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * 按布局变更创建目标外接框。
 * @param bounds - 当前外接框
 * @param layout - 布局变更
 * @returns 目标外接框，非法尺寸返回 null
 */
export function createNextMultiSelectionBounds(bounds: MultiSelectionBounds, layout: WidgetMultiSelectLayoutChange): MultiSelectionBounds | null {
  const nextWidth = layout.width ?? bounds.width;
  const nextHeight = layout.height ?? bounds.height;
  if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) {
    return null;
  }

  return {
    x: layout.x ?? bounds.x,
    y: layout.y ?? bounds.y,
    width: nextWidth,
    height: nextHeight
  };
}

/**
 * 按目标外接框转换多选元素布局。
 * @param element - 当前元素
 * @param currentBounds - 当前外接框
 * @param nextBounds - 目标外接框
 * @returns 转换后的元素
 */
export function transformElementByMultiSelectionBounds(
  element: WidgetElement,
  currentBounds: MultiSelectionBounds,
  nextBounds: MultiSelectionBounds
): WidgetElement {
  const scaleX = currentBounds.width === 0 ? 1 : nextBounds.width / currentBounds.width;
  const scaleY = currentBounds.height === 0 ? 1 : nextBounds.height / currentBounds.height;

  return {
    ...element,
    position: {
      x: normalizeMultiSelectLayoutValue(nextBounds.x + (element.position.x - currentBounds.x) * scaleX),
      y: normalizeMultiSelectLayoutValue(nextBounds.y + (element.position.y - currentBounds.y) * scaleY)
    },
    size: {
      width: Math.max(1, normalizeMultiSelectLayoutValue(element.size.width * scaleX)),
      height: Math.max(1, normalizeMultiSelectLayoutValue(element.size.height * scaleY))
    }
  };
}

/**
 * 判断元素是否锁定自身几何属性。
 * @param element - Widget 元素
 * @returns 是否禁止直接修改位置和尺寸
 */
export function isWidgetElementGeometryLocked(element: WidgetElement): boolean {
  return element.locked === true;
}

/**
 * 按 ID 从元素树读取选中元素。
 * @param elements - 当前Widget元素树
 * @param selectedIds - 当前选中元素 ID 集合
 * @returns 选中元素列表
 */
export function getSelectedElementsInTree(elements: WidgetElement[], selectedIds: Set<string>): WidgetElement[] {
  return flattenWidgetElementTree(elements)
    .filter((item: WidgetRenderTreeNode): boolean => selectedIds.has(item.element.id))
    .map((item: WidgetRenderTreeNode): WidgetElement => item.element);
}

/**
 * 判断当前多选是否允许批量编辑。
 * @param elements - 当前Widget元素树
 * @param selectedIds - 当前多选元素 ID 集合
 * @returns 是否属于同一个直接父级
 */
export function canEditMultiSelection(elements: WidgetElement[], selectedIds: Set<string>): boolean {
  return selectedIds.size > 1 && isSameParent(elements, [...selectedIds]);
}

/**
 * 批量更新选中元素布局。
 * @param elements - 当前Widget元素列表
 * @param selectedIds - 当前多选元素 ID 列表
 * @param layout - 布局变更
 * @returns 更新布局后的元素列表
 */
export function updateSelectedElementLayouts(elements: WidgetElement[], selectedIds: Set<string>, layout: WidgetMultiSelectLayoutChange): WidgetElement[] {
  const selectedElements = getSelectedElementsInTree(elements, selectedIds);
  const currentBounds = createMultiSelectionBounds(selectedElements);
  if (!currentBounds) {
    return elements;
  }

  const nextBounds = createNextMultiSelectionBounds(currentBounds, layout);
  if (!nextBounds) {
    return elements;
  }

  const editableElements = selectedElements.filter((element: WidgetElement): boolean => !isWidgetElementGeometryLocked(element));
  if (editableElements.length === 0) {
    return elements;
  }

  return editableElements.reduce<WidgetElement[]>(
    (nextElements: WidgetElement[], element: WidgetElement): WidgetElement[] =>
      updateElementInTree(
        nextElements,
        element.id,
        (currentElement: WidgetElement): WidgetElement => transformElementByMultiSelectionBounds(currentElement, currentBounds, nextBounds)
      ),
    elements
  );
}

/**
 * 批量合并选中元素样式。
 * @param elements - 当前Widget元素列表
 * @param selectedIds - 当前多选元素 ID 集合
 * @param style - 样式变更
 * @returns 合并样式后的元素列表
 */
export function mergeSelectedElementStyles(elements: WidgetElement[], selectedIds: Set<string>, style: WidgetElementStyleChange): WidgetElement[] {
  return getSelectedElementsInTree(elements, selectedIds).reduce<WidgetElement[]>(
    (nextElements: WidgetElement[], element: WidgetElement): WidgetElement[] =>
      updateElementInTree(
        nextElements,
        element.id,
        (currentElement: WidgetElement): WidgetElement => ({
          ...currentElement,
          style: {
            ...currentElement.style,
            ...style
          }
        })
      ),
    elements
  );
}

/**
 * 创建Widget多选设置处理逻辑。
 * @param options - hook 入参
 * @returns 多选设置处理器
 */
export function useMultiSelection(options: UseMultiSelectionOptions): UseMultiSelectionReturn {
  const { session, selectedElementIds, widgetRef } = options;

  /**
   * 处理右侧多选面板快捷操作。
   * @param payload - 快捷操作命令参数
   * @param payload.command - 快捷操作命令
   */
  function handleSettingsMultiCommand(payload: { command: SettingsMultiCommand }): void {
    const { command } = payload;
    switch (command) {
      case 'copy': {
        widgetRef.value?.copySelection();
        break;
      }
      case 'group': {
        widgetRef.value?.groupSelection();
        break;
      }
      case 'ungroup': {
        widgetRef.value?.ungroupSelection();
        break;
      }
      case 'delete': {
        widgetRef.value?.deleteSelection();
        break;
      }
      default: {
        widgetRef.value?.reorderSelection(command);
        break;
      }
    }
  }

  /**
   * 处理右侧元素专属快捷操作。
   * @param payload - 快捷操作命令参数
   * @param payload.command - 快捷操作命令
   */
  function handleSettingsElementCommand(payload: { command: SettingsElementCommand }): void {
    const { command } = payload;
    if (command === 'ungroup') {
      widgetRef.value?.ungroupSelection();
    }
  }

  /**
   * 处理右侧多选面板布局批量变更。
   * @param layout - 布局变更
   */
  function handleSettingsMultiLayoutChange(layout: WidgetMultiSelectLayoutChange): void {
    const selectedIds = new Set(selectedElementIds.value);
    if (!canEditMultiSelection(session.data.value.elements, selectedIds)) {
      return;
    }

    session.data.value = {
      ...session.data.value,
      elements: updateSelectedElementLayouts(session.data.value.elements, selectedIds, layout)
    };
  }

  /**
   * 处理右侧多选面板样式批量变更。
   * @param style - 样式变更
   */
  function handleSettingsMultiStyleChange(style: WidgetElementStyleChange): void {
    const selectedIds = new Set(selectedElementIds.value);
    if (!canEditMultiSelection(session.data.value.elements, selectedIds)) {
      return;
    }

    session.data.value = {
      ...session.data.value,
      elements: mergeSelectedElementStyles(session.data.value.elements, selectedIds, style)
    };
  }

  return {
    onMultiCommand: handleSettingsMultiCommand,
    onElementCommand: handleSettingsElementCommand,
    onMultiLayoutChange: handleSettingsMultiLayoutChange,
    onMultiStyleChange: handleSettingsMultiStyleChange
  };
}

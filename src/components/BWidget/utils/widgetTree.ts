/**
 * @file widgetTree.ts
 * @description BWidget 元素树查找、坐标转换与不可变更新工具。
 */
import type { WidgetElement, WidgetPoint } from '../types';
import { cloneDeep } from 'lodash-es';

/**
 * 元素树命中节点信息。
 */
export interface WidgetElementTreeNode {
  /** 当前元素 */
  element: WidgetElement;
  /** 直接父元素 ID，顶层元素为 null */
  parentId: string | null;
  /** 当前元素所在的同级列表 */
  siblings: WidgetElement[];
  /** 当前元素在同级列表中的下标 */
  index: number;
  /** 从顶层到当前元素的 ID 路径 */
  path: string[];
}

/**
 * 元素树渲染快照节点。
 */
export interface WidgetRenderTreeNode {
  /** 当前元素 */
  element: WidgetElement;
  /** 直接父元素 ID，顶层元素为 null */
  parentId: string | null;
  /** 从顶层到当前元素的 ID 路径 */
  path: string[];
  /** 嵌套深度，顶层为 0 */
  depth: number;
  /** 当前元素在画布中的绝对坐标 */
  absolutePosition: WidgetPoint;
}

/**
 * 元素树删除结果。
 */
export interface WidgetTreeRemoveResult {
  /** 删除后的顶层元素树 */
  elements: WidgetElement[];
  /** 被删除的元素，不存在时为 null */
  removed: WidgetElement | null;
}

/**
 * 判断元素是否为组合容器。
 * @param element - 待判断元素
 * @returns 是否为组合元素
 */
export function isWidgetGroupElement(element: Pick<WidgetElement, 'name'>): boolean {
  return element.name === 'group';
}

/**
 * 读取元素子元素列表。
 * @param element - Widget元素
 * @returns 子元素列表，非组合元素返回空数组
 */
export function readWidgetElementChildren(element: WidgetElement): WidgetElement[] {
  return isWidgetGroupElement(element) && Array.isArray(element.children) ? element.children : [];
}

/**
 * 将元素树扁平化为带绝对坐标的渲染快照。
 * @param elements - 当前层元素列表
 * @param parentId - 直接父元素 ID
 * @param parentPosition - 直接父元素绝对坐标
 * @param parentPath - 直接父元素路径
 * @param depth - 当前层深度
 * @returns 渲染快照列表
 */
export function flattenWidgetElementTree(
  elements: WidgetElement[],
  parentId: string | null = null,
  parentPosition: WidgetPoint = { x: 0, y: 0 },
  parentPath: string[] = [],
  depth = 0
): WidgetRenderTreeNode[] {
  return elements.flatMap((element: WidgetElement): WidgetRenderTreeNode[] => {
    const absolutePosition = {
      x: parentPosition.x + element.position.x,
      y: parentPosition.y + element.position.y
    };
    const path = [...parentPath, element.id];
    const current: WidgetRenderTreeNode = {
      element,
      parentId,
      path,
      depth,
      absolutePosition
    };

    return [current, ...flattenWidgetElementTree(readWidgetElementChildren(element), element.id, absolutePosition, path, depth + 1)];
  });
}

/**
 * 在元素树中查找指定元素。
 * @param elements - 顶层元素树
 * @param elementId - 目标元素 ID
 * @returns 命中节点信息，不存在时返回 null
 */
export function findElementTreeNode(elements: WidgetElement[], elementId: string): WidgetElementTreeNode | null {
  /**
   * 递归查找当前层元素。
   * @param items - 当前层元素列表
   * @param parentId - 直接父元素 ID
   * @param parentPath - 直接父元素路径
   * @returns 命中节点信息
   */
  function walk(items: WidgetElement[], parentId: string | null, parentPath: string[]): WidgetElementTreeNode | null {
    for (let index = 0; index < items.length; index += 1) {
      const element = items[index];
      if (element) {
        const path = [...parentPath, element.id];
        if (element.id === elementId) {
          return {
            element,
            parentId,
            siblings: items,
            index,
            path
          };
        }

        const found = walk(readWidgetElementChildren(element), element.id, path);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  return walk(elements, null, []);
}

/**
 * 归一化元素选区，过滤不存在节点，并在父子同时选中时只保留祖先节点。
 * @param elements - 顶层元素树
 * @param selection - 原始选区 ID 列表
 * @returns 归一化后的选区 ID 列表
 */
export function normalizeWidgetElementSelection(elements: WidgetElement[], selection: string[]): string[] {
  const selectedIds = new Set(selection);
  const normalizedIds = new Set<string>();
  const normalizedSelection: string[] = [];

  selection.forEach((elementId: string): void => {
    if (normalizedIds.has(elementId)) {
      return;
    }

    const node = findElementTreeNode(elements, elementId);
    if (!node) {
      return;
    }

    const hasSelectedAncestor = node.path.slice(0, -1).some((ancestorId: string): boolean => selectedIds.has(ancestorId));
    if (hasSelectedAncestor) {
      return;
    }

    normalizedIds.add(elementId);
    normalizedSelection.push(elementId);
  });

  return normalizedSelection;
}

/**
 * 不可变更新元素树中的指定元素。
 * @param elements - 顶层元素树
 * @param elementId - 目标元素 ID
 * @param update - 更新函数
 * @returns 更新后的元素树
 */
export function updateElementInTree(elements: WidgetElement[], elementId: string, update: (element: WidgetElement) => WidgetElement): WidgetElement[] {
  return elements.map((element: WidgetElement): WidgetElement => {
    if (element.id === elementId) {
      return update(cloneDeep(element));
    }

    const children = readWidgetElementChildren(element);
    if (children.length === 0) {
      return element;
    }

    return {
      ...element,
      children: updateElementInTree(children, elementId, update)
    };
  });
}

/**
 * 从元素树中删除指定元素。
 * @param elements - 顶层元素树
 * @param elementId - 目标元素 ID
 * @returns 删除结果
 */
export function removeElementFromTree(elements: WidgetElement[], elementId: string): WidgetTreeRemoveResult {
  let removed: WidgetElement | null = null;

  /**
   * 递归删除当前层目标元素。
   * @param items - 当前层元素列表
   * @returns 删除后的当前层元素列表
   */
  function walk(items: WidgetElement[]): WidgetElement[] {
    return items.reduce<WidgetElement[]>((nextItems: WidgetElement[], element: WidgetElement): WidgetElement[] => {
      if (element.id === elementId) {
        removed = cloneDeep(element);
        return nextItems;
      }

      const children = readWidgetElementChildren(element);
      nextItems.push(children.length > 0 ? { ...element, children: walk(children) } : element);

      return nextItems;
    }, []);
  }

  return {
    elements: walk(elements),
    removed
  };
}

/**
 * 移除元素树中的空组合容器。
 * @param elements - 顶层元素树
 * @returns 移除空组合后的元素树
 */
export function removeEmptyWidgetGroups(elements: WidgetElement[]): WidgetElement[] {
  let changed = false;
  const nextElements = elements.reduce<WidgetElement[]>((nextItems: WidgetElement[], element: WidgetElement): WidgetElement[] => {
    if (!isWidgetGroupElement(element)) {
      nextItems.push(element);
      return nextItems;
    }

    const children = readWidgetElementChildren(element);
    const nextChildren = removeEmptyWidgetGroups(children);
    if (nextChildren.length === 0) {
      changed = true;
      return nextItems;
    }

    if (nextChildren !== children) {
      changed = true;
      nextItems.push({
        ...element,
        children: nextChildren
      });
      return nextItems;
    }

    nextItems.push(element);
    return nextItems;
  }, []);

  return changed ? nextElements : elements;
}

/**
 * 读取元素在画布中的绝对坐标。
 * @param elements - 顶层元素树
 * @param elementId - 目标元素 ID
 * @returns 绝对坐标，不存在时返回 null
 */
export function getAbsolutePosition(elements: WidgetElement[], elementId: string): WidgetPoint | null {
  return flattenWidgetElementTree(elements).find((item: WidgetRenderTreeNode): boolean => item.element.id === elementId)?.absolutePosition ?? null;
}

/**
 * 将画布绝对坐标转换为指定父级下的局部坐标。
 * @param elements - 顶层元素树
 * @param parentId - 目标父级元素 ID，顶层为 null
 * @param point - 画布绝对坐标
 * @returns 父级局部坐标，找不到父级时返回原坐标
 */
export function getLocalPosition(elements: WidgetElement[], parentId: string | null, point: WidgetPoint): WidgetPoint {
  if (parentId === null) {
    return { ...point };
  }

  const parentPosition = getAbsolutePosition(elements, parentId);
  if (!parentPosition) {
    return { ...point };
  }

  return {
    x: point.x - parentPosition.x,
    y: point.y - parentPosition.y
  };
}

/**
 * 替换指定直接父级下的同级元素列表。
 * @param elements - 顶层元素树
 * @param parentId - 目标父级元素 ID，顶层为 null
 * @param nextSiblings - 新同级元素列表
 * @returns 替换后的元素树
 */
export function replaceSiblingList(elements: WidgetElement[], parentId: string | null, nextSiblings: WidgetElement[]): WidgetElement[] {
  if (parentId === null) {
    return cloneDeep(nextSiblings);
  }

  return updateElementInTree(
    elements,
    parentId,
    (element: WidgetElement): WidgetElement => ({
      ...element,
      children: cloneDeep(nextSiblings)
    })
  );
}

/**
 * 判断目标元素是否属于同一个直接父级。
 * @param elements - 顶层元素树
 * @param elementIds - 目标元素 ID 列表
 * @returns 是否同属一个直接父级
 */
export function isSameParent(elements: WidgetElement[], elementIds: string[]): boolean {
  if (elementIds.length === 0) {
    return false;
  }

  const parentIds = elementIds.map((elementId: string): string | null | undefined => findElementTreeNode(elements, elementId)?.parentId);
  if (parentIds.some((parentId: string | null | undefined): boolean => parentId === undefined)) {
    return false;
  }

  return parentIds.every((parentId: string | null | undefined): boolean => parentId === parentIds[0]);
}

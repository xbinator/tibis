/**
 * @file layerOrder.ts
 * @description Widget侧栏图层展示顺序与Widget元素数据顺序的转换工具。
 */
import type { WidgetElement } from '@/components/BWidget/types';
import {
  findElementTreeNode,
  getAbsolutePosition,
  getLocalPosition,
  isWidgetGroupElement,
  readWidgetElementChildren,
  removeEmptyWidgetGroups,
  removeElementFromTree,
  replaceSiblingList,
  type WidgetElementTreeNode
} from '@/components/BWidget/utils/widgetTree';

/**
 * 图层移动插入位置，含义基于侧栏从上到下的视觉顺序。
 */
export type WidgetLayerMovePosition = 'before' | 'after' | 'inside';

/**
 * 判断两组元素是否保持相同层级顺序。
 * @param currentElements - 当前元素列表
 * @param nextElements - 调整后的元素列表
 * @returns 是否为相同顺序
 */
function isSameLayerOrder(currentElements: WidgetElement[], nextElements: WidgetElement[]): boolean {
  return (
    currentElements.length === nextElements.length &&
    currentElements.every((element: WidgetElement, index: number): boolean => element.id === nextElements[index]?.id)
  );
}

/**
 * 读取一组元素共同所在的同级列表。
 * @param elements - 顶层元素树
 * @param elementIds - 目标元素 ID 列表
 * @returns 共同父级和同级列表，不同父级或缺失时返回 null
 */
function resolveSiblingContext(elements: WidgetElement[], elementIds: string[]): { parentId: string | null; siblings: WidgetElement[] } | null {
  const firstNode = findElementTreeNode(elements, elementIds[0] ?? '');
  if (!firstNode) {
    return null;
  }

  const isSameParent = elementIds.every((elementId: string): boolean => {
    const node = findElementTreeNode(elements, elementId);

    return Boolean(node && node.parentId === firstNode.parentId);
  });
  if (!isSameParent) {
    return null;
  }

  return {
    parentId: firstNode.parentId,
    siblings: firstNode.siblings
  };
}

/**
 * 判断目标节点是否位于源节点子树内。
 * @param sourceNode - 被移动源节点
 * @param targetNode - 投放目标节点
 * @returns 目标节点是否为源节点自身或后代
 */
function isInSourceSubtree(sourceNode: WidgetElementTreeNode, targetNode: WidgetElementTreeNode): boolean {
  if (targetNode.path.length < sourceNode.path.length) {
    return false;
  }

  return sourceNode.path.every((elementId: string, index: number): boolean => targetNode.path[index] === elementId);
}

/**
 * 生成跨父级移动后的元素，保持画布绝对位置不变。
 * @param originalElements - 移动前元素树
 * @param nextElements - 移除源节点后的元素树
 * @param element - 被移动元素
 * @param nextParentId - 移动后的直接父级 ID
 * @returns 更新局部坐标后的元素
 */
function createMovedElement(
  originalElements: WidgetElement[],
  nextElements: WidgetElement[],
  element: WidgetElement,
  nextParentId: string | null
): WidgetElement {
  const absolutePosition = getAbsolutePosition(originalElements, element.id) ?? element.position;

  return {
    ...element,
    position: getLocalPosition(nextElements, nextParentId, absolutePosition)
  };
}

/**
 * 按侧栏视觉顺序把源元素插入到目标元素前后。
 * @param siblings - 目标所在同级列表
 * @param sourceElement - 被移动元素
 * @param targetElementId - 目标元素 ID
 * @param position - 目标视觉位置
 * @returns 插入后的同级列表；目标缺失时返回 null
 */
function insertByDisplay(
  siblings: WidgetElement[],
  sourceElement: WidgetElement,
  targetElementId: string,
  position: Exclude<WidgetLayerMovePosition, 'inside'>
): WidgetElement[] | null {
  const displayElements = [...siblings].reverse();
  const targetIndex = displayElements.findIndex((element: WidgetElement): boolean => element.id === targetElementId);
  if (targetIndex === -1) {
    return null;
  }

  const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
  displayElements.splice(insertIndex, 0, sourceElement);

  return displayElements.reverse();
}

/**
 * 将元素作为组合内视觉最上层子元素插入。
 * @param children - 组合当前子元素
 * @param sourceElement - 被移动元素
 * @returns 插入后的组合子元素
 */
function insertElementInsideGroup(children: WidgetElement[], sourceElement: WidgetElement): WidgetElement[] {
  const displayElements = [...children].reverse();
  displayElements.unshift(sourceElement);

  return displayElements.reverse();
}

/**
 * 把已移除的源元素按位置放入目标节点，返回调整后的元素树。
 * 内部统一处理 inside / before-after 两种对称分支，调用方需先完成移除与合法性校验。
 * @param originalElements - 移动前元素树（用于换算绝对位置）
 * @param nextElements - 已移除源节点后的元素树
 * @param removedElement - 被移动的源元素
 * @param targetNode - 投放目标节点（基于 nextElements 重新定位）
 * @param position - 插入位置
 * @returns 调整后的元素树；目标不可用时返回 null
 */
function placeInTarget(
  originalElements: WidgetElement[],
  nextElements: WidgetElement[],
  removedElement: WidgetElement,
  targetNode: WidgetElementTreeNode,
  position: WidgetLayerMovePosition
): WidgetElement[] | null {
  if (position === 'inside') {
    if (!isWidgetGroupElement(targetNode.element)) {
      return null;
    }

    const movedElement = createMovedElement(originalElements, nextElements, removedElement, targetNode.element.id);
    const nextChildren = insertElementInsideGroup(readWidgetElementChildren(targetNode.element), movedElement);

    return removeEmptyWidgetGroups(replaceSiblingList(nextElements, targetNode.element.id, nextChildren));
  }

  const movedElement = createMovedElement(originalElements, nextElements, removedElement, targetNode.parentId);
  const nextSiblings = insertByDisplay(targetNode.siblings, movedElement, targetNode.element.id, position);
  if (!nextSiblings) {
    return null;
  }

  return removeEmptyWidgetGroups(replaceSiblingList(nextElements, targetNode.parentId, nextSiblings));
}

/**
 * 跨父级移动Widget元素。
 * @param elements - 当前Widget元素列表
 * @param sourceNode - 被移动源节点
 * @param targetNode - 投放目标节点
 * @param position - 插入位置
 * @returns 调整后的Widget元素列表；无效移动时返回原数组引用
 */
function moveAcrossParents(
  elements: WidgetElement[],
  sourceNode: WidgetElementTreeNode,
  targetNode: WidgetElementTreeNode,
  position: WidgetLayerMovePosition
): WidgetElement[] {
  if (isInSourceSubtree(sourceNode, targetNode)) {
    return elements;
  }

  const removeResult = removeElementFromTree(elements, sourceNode.element.id);
  if (!removeResult.removed) {
    return elements;
  }

  const targetAfterRemoval = findElementTreeNode(removeResult.elements, targetNode.element.id);
  if (!targetAfterRemoval) {
    return elements;
  }

  const placedElements = placeInTarget(elements, removeResult.elements, removeResult.removed, targetAfterRemoval, position);

  return placedElements ?? elements;
}

/**
 * 在同级列表内按侧栏视觉顺序移动一组元素到目标元素前后。
 * 源元素与目标元素需位于同一同级列表，调用方需先完成合法性校验与跨父级分发。
 * @param siblings - 当前同级列表（存储顺序：底层到顶层）
 * @param sourceIds - 被移动元素 ID 集合
 * @param targetIds - 目标元素 ID 集合
 * @param position - 插入到目标视觉上的前方或后方
 * @returns 调整后的同级列表；无有效移动时返回原数组引用
 */
function reorderSiblingsWithinParent(
  siblings: WidgetElement[],
  sourceIds: Set<string>,
  targetIds: Set<string>,
  position: Exclude<WidgetLayerMovePosition, 'inside'>
): WidgetElement[] {
  const displayElements = [...siblings].reverse();

  // 取出源元素块，并在展示列表中剔除，避免插入时位置偏移
  const sourceBlock = displayElements.filter((element: WidgetElement): boolean => sourceIds.has(element.id));
  if (!sourceBlock.length) {
    return siblings;
  }
  const displayElementsWithoutSource = displayElements.filter((element: WidgetElement): boolean => !sourceIds.has(element.id));

  // 在剔除源后的列表中定位目标，确定插入位置
  const targetIndexes = displayElementsWithoutSource
    .map((element: WidgetElement, index: number): number => (targetIds.has(element.id) ? index : -1))
    .filter((index: number): boolean => index >= 0);
  if (!targetIndexes.length) {
    return siblings;
  }

  const insertIndex = position === 'before' ? Math.min(...targetIndexes) : Math.max(...targetIndexes) + 1;
  displayElementsWithoutSource.splice(insertIndex, 0, ...sourceBlock);

  return displayElementsWithoutSource.reverse();
}

/**
 * 在已解析的同级上下文中完成排序并写回元素树。
 * 统一两个 reorder 公开函数的「解析上下文 → 排序同级 → 判等写回」收尾逻辑。
 * @param elements - 当前Widget元素列表
 * @param siblingIds - 参与排序的全部元素 ID（源 + 目标）
 * @param sourceIds - 被移动元素 ID 集合
 * @param targetIds - 目标元素 ID 集合
 * @param position - 插入到目标视觉上的前方或后方
 * @returns 调整后的Widget元素列表；无效移动时返回原数组引用
 */
function applySiblingReorder(
  elements: WidgetElement[],
  siblingIds: string[],
  sourceIds: Set<string>,
  targetIds: Set<string>,
  position: Exclude<WidgetLayerMovePosition, 'inside'>
): WidgetElement[] {
  const context = resolveSiblingContext(elements, siblingIds);
  if (!context) {
    return elements;
  }

  const nextSiblings = reorderSiblingsWithinParent(context.siblings, sourceIds, targetIds, position);

  return isSameLayerOrder(context.siblings, nextSiblings) ? elements : replaceSiblingList(elements, context.parentId, nextSiblings);
}

/**
 * 按侧栏视觉顺序移动Widget元素，并返回Widget真实层级顺序。
 * Widget元素数组按从底层到顶层存储，侧栏为方便查看会倒序展示。
 * @param elements - 当前Widget元素列表
 * @param sourceElementId - 被拖拽元素 ID
 * @param targetElementId - 命中的目标元素 ID
 * @param position - 插入到目标元素视觉上的前方或后方
 * @returns 调整后的Widget元素列表；无效移动时返回原数组引用
 */
export function moveLayerElement(
  elements: WidgetElement[],
  sourceElementId: string,
  targetElementId: string,
  position: WidgetLayerMovePosition
): WidgetElement[] {
  if (sourceElementId === targetElementId) {
    return elements;
  }

  const sourceNode = findElementTreeNode(elements, sourceElementId);
  const targetNode = findElementTreeNode(elements, targetElementId);
  if (!sourceNode || !targetNode) {
    return elements;
  }

  if (position === 'inside' || sourceNode.parentId !== targetNode.parentId) {
    return moveAcrossParents(elements, sourceNode, targetNode, position);
  }

  return applySiblingReorder(elements, [sourceElementId, targetElementId], new Set([sourceElementId]), new Set([targetElementId]), position);
}

/**
 * 按侧栏视觉顺序移动Widget元素组，并返回Widget真实层级顺序。
 * @param elements - 当前Widget元素列表
 * @param sourceElementIds - 被拖拽元素 ID 列表
 * @param targetElementIds - 命中的目标元素 ID 列表
 * @param position - 插入到目标展示项视觉上的前方或后方
 * @returns 调整后的Widget元素列表；无效移动时返回原数组引用
 */
export function moveLayerElements(
  elements: WidgetElement[],
  sourceElementIds: string[],
  targetElementIds: string[],
  position: WidgetLayerMovePosition
): WidgetElement[] {
  if (position === 'inside') {
    return elements;
  }

  const sourceIds = new Set(sourceElementIds);
  const targetIds = new Set(targetElementIds);
  if (!sourceIds.size || !targetIds.size || sourceElementIds.some((id: string): boolean => targetIds.has(id))) {
    return elements;
  }

  return applySiblingReorder(elements, [...sourceElementIds, ...targetElementIds], sourceIds, targetIds, position);
}

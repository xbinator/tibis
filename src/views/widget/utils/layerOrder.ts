/**
 * @file layerOrder.ts
 * @description Widget侧栏图层展示顺序与Widget元素数据顺序的转换工具。
 */
import type { WidgetElement } from '@/components/BWidget/types';
import {
  findWidgetElementTreeNode,
  getWidgetElementAbsolutePosition,
  getWidgetElementParentLocalPosition,
  isWidgetGroupElement,
  readWidgetElementChildren,
  removeEmptyWidgetGroups,
  removeWidgetElementFromTree,
  replaceWidgetElementSiblingList,
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
function isSameWidgetLayerOrder(currentElements: WidgetElement[], nextElements: WidgetElement[]): boolean {
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
function resolveWidgetLayerSiblingContext(elements: WidgetElement[], elementIds: string[]): { parentId: string | null; siblings: WidgetElement[] } | null {
  const firstNode = findWidgetElementTreeNode(elements, elementIds[0] ?? '');
  if (!firstNode) {
    return null;
  }

  const isSameParent = elementIds.every((elementId: string): boolean => {
    const node = findWidgetElementTreeNode(elements, elementId);

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
function isNodeInSourceSubtree(sourceNode: WidgetElementTreeNode, targetNode: WidgetElementTreeNode): boolean {
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
function createMovedElementForParent(
  originalElements: WidgetElement[],
  nextElements: WidgetElement[],
  element: WidgetElement,
  nextParentId: string | null
): WidgetElement {
  const absolutePosition = getWidgetElementAbsolutePosition(originalElements, element.id) ?? element.position;

  return {
    ...element,
    position: getWidgetElementParentLocalPosition(nextElements, nextParentId, absolutePosition)
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
function insertElementByDisplayPosition(
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
 * 跨父级移动Widget元素。
 * @param elements - 当前Widget元素列表
 * @param sourceNode - 被移动源节点
 * @param targetNode - 投放目标节点
 * @param position - 插入位置
 * @returns 调整后的Widget元素列表；无效移动时返回原数组引用
 */
function moveWidgetLayerElementAcrossParents(
  elements: WidgetElement[],
  sourceNode: WidgetElementTreeNode,
  targetNode: WidgetElementTreeNode,
  position: WidgetLayerMovePosition
): WidgetElement[] {
  if (isNodeInSourceSubtree(sourceNode, targetNode)) {
    return elements;
  }

  if (position === 'inside' && !isWidgetGroupElement(targetNode.element)) {
    return elements;
  }

  const removeResult = removeWidgetElementFromTree(elements, sourceNode.element.id);
  if (!removeResult.removed) {
    return elements;
  }

  if (position === 'inside') {
    const targetGroupNode = findWidgetElementTreeNode(removeResult.elements, targetNode.element.id);
    if (!targetGroupNode || !isWidgetGroupElement(targetGroupNode.element)) {
      return elements;
    }

    const movedElement = createMovedElementForParent(elements, removeResult.elements, removeResult.removed, targetGroupNode.element.id);
    const nextChildren = insertElementInsideGroup(readWidgetElementChildren(targetGroupNode.element), movedElement);

    return removeEmptyWidgetGroups(replaceWidgetElementSiblingList(removeResult.elements, targetGroupNode.element.id, nextChildren));
  }

  const targetAfterRemoval = findWidgetElementTreeNode(removeResult.elements, targetNode.element.id);
  if (!targetAfterRemoval) {
    return elements;
  }

  const movedElement = createMovedElementForParent(elements, removeResult.elements, removeResult.removed, targetAfterRemoval.parentId);
  const nextSiblings = insertElementByDisplayPosition(targetAfterRemoval.siblings, movedElement, targetAfterRemoval.element.id, position);
  if (!nextSiblings) {
    return elements;
  }

  return removeEmptyWidgetGroups(replaceWidgetElementSiblingList(removeResult.elements, targetAfterRemoval.parentId, nextSiblings));
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
export function reorderWidgetLayerElementsByDisplayPosition(
  elements: WidgetElement[],
  sourceElementId: string,
  targetElementId: string,
  position: WidgetLayerMovePosition
): WidgetElement[] {
  if (sourceElementId === targetElementId) {
    return elements;
  }

  const sourceNode = findWidgetElementTreeNode(elements, sourceElementId);
  const targetNode = findWidgetElementTreeNode(elements, targetElementId);
  if (!sourceNode || !targetNode) {
    return elements;
  }

  if (position === 'inside' || sourceNode.parentId !== targetNode.parentId) {
    return moveWidgetLayerElementAcrossParents(elements, sourceNode, targetNode, position);
  }

  const context = resolveWidgetLayerSiblingContext(elements, [sourceElementId, targetElementId]);
  if (!context) {
    return elements;
  }

  const displayElements = [...context.siblings].reverse();
  const sourceIndex = displayElements.findIndex((element: WidgetElement): boolean => element.id === sourceElementId);
  const targetIndex = displayElements.findIndex((element: WidgetElement): boolean => element.id === targetElementId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return elements;
  }

  const [sourceElement] = displayElements.splice(sourceIndex, 1);
  const targetIndexAfterRemoval = displayElements.findIndex((element: WidgetElement): boolean => element.id === targetElementId);
  if (!sourceElement || targetIndexAfterRemoval === -1) {
    return elements;
  }

  const insertIndex = position === 'before' ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;
  displayElements.splice(insertIndex, 0, sourceElement);
  const nextSiblings = displayElements.reverse();

  return isSameWidgetLayerOrder(context.siblings, nextSiblings) ? elements : replaceWidgetElementSiblingList(elements, context.parentId, nextSiblings);
}

/**
 * 按侧栏视觉顺序移动Widget元素组，并返回Widget真实层级顺序。
 * @param elements - 当前Widget元素列表
 * @param sourceElementIds - 被拖拽元素 ID 列表
 * @param targetElementIds - 命中的目标元素 ID 列表
 * @param position - 插入到目标展示项视觉上的前方或后方
 * @returns 调整后的Widget元素列表；无效移动时返回原数组引用
 */
export function reorderWidgetLayerElementGroupsByDisplayPosition(
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

  const context = resolveWidgetLayerSiblingContext(elements, [...sourceElementIds, ...targetElementIds]);
  if (!context) {
    return elements;
  }

  const displayElements = [...context.siblings].reverse();
  const sourceBlock = displayElements.filter((element: WidgetElement): boolean => sourceIds.has(element.id));
  if (!sourceBlock.length) {
    return elements;
  }

  const displayElementsWithoutSource = displayElements.filter((element: WidgetElement): boolean => !sourceIds.has(element.id));
  const targetIndexes = displayElementsWithoutSource
    .map((element: WidgetElement, index: number): number => (targetIds.has(element.id) ? index : -1))
    .filter((index: number): boolean => index >= 0);
  if (!targetIndexes.length) {
    return elements;
  }

  const insertIndex = position === 'before' ? Math.min(...targetIndexes) : Math.max(...targetIndexes) + 1;
  displayElementsWithoutSource.splice(insertIndex, 0, ...sourceBlock);
  const nextSiblings = displayElementsWithoutSource.reverse();

  return isSameWidgetLayerOrder(context.siblings, nextSiblings) ? elements : replaceWidgetElementSiblingList(elements, context.parentId, nextSiblings);
}

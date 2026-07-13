/**
 * @file useLayerActions.ts
 * @description Widget页面侧栏图层选择、复制、删除和排序操作。
 */
import type { WidgetComponentRef } from './types';
import type { Ref } from 'vue';
import { nextTick } from 'vue';
import { cloneDeep } from 'lodash-es';
import { nanoid } from 'nanoid';
import type { WidgetData, WidgetElement, WidgetSelectTarget } from '@/components/BWidget/types';
import {
  findElementTreeNode,
  flattenWidgetElementTree,
  isSameParent,
  readWidgetElementChildren,
  removeEmptyWidgetGroups,
  removeElementFromTree,
  replaceSiblingList,
  type WidgetRenderTreeNode
} from '@/components/BWidget/utils/widgetTree';
import type { UseFileSessionReturn } from '@/hooks/useFileSession';
import { moveLayerElements, moveLayerElement, type WidgetLayerMovePosition } from '../utils/layerOrder';
import { isWidgetElementTarget } from './useSelection';

/** 侧栏复制图层时使用的位置偏移。 */
const WIDGET_LAYER_COPY_OFFSET = 16;
/** 侧栏复制图层时使用的新元素 ID 长度。 */
const WIDGET_LAYER_COPY_ID_SIZE = 8;

/**
 * 侧栏图层操作 hook 入参。
 */
export interface UseLayerActionsOptions {
  /** 当前Widget文件会话 */
  session: UseFileSessionReturn<WidgetData>;
  /** 当前右侧设置栏可编辑目标 */
  selectedTarget: Ref<WidgetSelectTarget>;
  /** 当前侧栏需要高亮的元素 ID 列表 */
  selectedElementIds: Ref<string[]>;
  /** Widget画布组件引用 */
  widgetRef: Ref<WidgetComponentRef | undefined>;
}

/**
 * 侧栏图层拖拽排序参数。
 */
export interface LayerMovePayload {
  /** 被移动元素 ID 列表 */
  sourceIds: string[];
  /** 目标元素 ID 列表 */
  targetIds: string[];
  /** 基于侧栏视觉顺序的插入位置 */
  position: WidgetLayerMovePosition;
}

/**
 * 侧栏图层操作命名空间。
 */
export interface LayerActions {
  /** 选择一个或多个图层 */
  select: (elements: WidgetElement[]) => void;
  /** 复制一个或多个图层 */
  copy: (elements: WidgetElement[]) => Promise<void>;
  /** 删除一个或多个图层 */
  remove: (elements: WidgetElement[]) => void;
  /** 拖拽排序一个或多个图层 */
  move: (payload: LayerMovePayload) => void;
}

/**
 * 创建侧栏复制元素 ID。
 * @param elements - 当前元素列表
 * @returns 新元素 ID
 */
export function createLayerCopyElementId(elements: WidgetElement[]): string {
  const existingIds = new Set(flattenWidgetElementTree(elements).map((item: WidgetRenderTreeNode): string => item.element.id));
  let nextId = nanoid(WIDGET_LAYER_COPY_ID_SIZE);

  while (existingIds.has(nextId)) {
    nextId = nanoid(WIDGET_LAYER_COPY_ID_SIZE);
  }

  return nextId;
}

/**
 * 创建侧栏复制出来的独立元素。
 * @param element - 原始元素
 * @param elements - 当前元素列表
 * @returns 新Widget元素
 */
export function createLayerCopyElement(element: WidgetElement, elements: WidgetElement[]): WidgetElement {
  const usedElements = [...elements];

  /**
   * 递归复制当前元素子树。
   * @param sourceElement - 原始元素
   * @param offsetRoot - 是否偏移当前复制根节点
   * @returns 复制后的元素
   */
  function copyElementTree(sourceElement: WidgetElement, offsetRoot: boolean): WidgetElement {
    const nextElement = cloneDeep(sourceElement);

    nextElement.id = createLayerCopyElementId(usedElements);
    usedElements.push(nextElement);
    nextElement.position = offsetRoot
      ? {
          x: sourceElement.position.x + WIDGET_LAYER_COPY_OFFSET,
          y: sourceElement.position.y + WIDGET_LAYER_COPY_OFFSET
        }
      : { ...sourceElement.position };
    nextElement.children = readWidgetElementChildren(sourceElement).map((child: WidgetElement): WidgetElement => copyElementTree(child, false));
    if (nextElement.children.length === 0) {
      delete nextElement.children;
    }

    return nextElement;
  }

  return copyElementTree(element, true);
}

/**
 * 按当前Widget层级顺序整理目标元素。
 * @param elements - 当前元素列表
 * @param targetElements - 目标元素列表
 * @returns 按Widget层级排序后的目标元素
 */
export function sortElementsByLayerOrder(elements: WidgetElement[], targetElements: WidgetElement[]): WidgetElement[] {
  const targetIds = new Set(targetElements.map((element: WidgetElement): string => element.id));
  const firstNode = findElementTreeNode(elements, targetElements[0]?.id ?? '');
  if (!firstNode || !isSameParent(elements, [...targetIds])) {
    return [];
  }

  return firstNode.siblings.filter((element: WidgetElement): boolean => targetIds.has(element.id));
}

/**
 * 创建侧栏复制出来的元素列表。
 * @param targetElements - 原始元素列表
 * @param elements - 当前元素列表
 * @returns 新Widget元素列表
 */
export function createLayerCopyElements(targetElements: WidgetElement[], elements: WidgetElement[]): WidgetElement[] {
  const orderedElements = sortElementsByLayerOrder(elements, targetElements);
  const elementsWithCopies = [...elements];

  return orderedElements.map((element: WidgetElement): WidgetElement => {
    const copiedElement = createLayerCopyElement(element, elementsWithCopies);

    elementsWithCopies.push(copiedElement);
    return copiedElement;
  });
}

/**
 * 将复制元素插入到原元素上一层。
 * @param elements - 当前元素列表
 * @param sourceElementId - 原始元素 ID
 * @param copiedElement - 复制元素
 * @returns 插入后的元素列表
 */
export function insertLayerCopyAboveSource(elements: WidgetElement[], sourceElementId: string, copiedElement: WidgetElement): WidgetElement[] {
  const sourceNode = findElementTreeNode(elements, sourceElementId);
  if (!sourceNode) {
    return [...elements, copiedElement];
  }

  const nextSiblings = [...sourceNode.siblings];
  nextSiblings.splice(sourceNode.index + 1, 0, copiedElement);

  return replaceSiblingList(elements, sourceNode.parentId, nextSiblings);
}

/**
 * 将复制元素列表插入到原元素组上一层。
 * @param elements - 当前元素列表
 * @param sourceElements - 原始元素组 ID 列表
 * @param copiedElements - 复制元素列表
 * @returns 插入后的元素列表
 */
export function insertLayerCopiesAboveSources(elements: WidgetElement[], sourceElements: WidgetElement[], copiedElements: WidgetElement[]): WidgetElement[] {
  const orderedSourceElements = sortElementsByLayerOrder(elements, sourceElements);
  const firstNode = findElementTreeNode(elements, orderedSourceElements[0]?.id ?? '');
  if (!firstNode) {
    return [...elements, ...copiedElements];
  }

  const sourceIds = new Set(sourceElements.map((element: WidgetElement): string => element.id));
  const sourceIndexes = firstNode.siblings
    .map((element: WidgetElement, index: number): number => (sourceIds.has(element.id) ? index : -1))
    .filter((index: number): boolean => index >= 0);
  if (sourceIndexes.length === 0) {
    return [...elements, ...copiedElements];
  }

  const nextSiblings = [...firstNode.siblings];
  nextSiblings.splice(Math.max(...sourceIndexes) + 1, 0, ...copiedElements);

  return replaceSiblingList(elements, firstNode.parentId, nextSiblings);
}

/**
 * 计算元素树更新后被移除的节点 ID。
 * @param previousElements - 更新前元素树
 * @param nextElements - 更新后元素树
 * @returns 被移除节点 ID 集合
 */
export function collectRemovedElementIds(previousElements: WidgetElement[], nextElements: WidgetElement[]): Set<string> {
  const nextIds = new Set(flattenWidgetElementTree(nextElements).map((item: WidgetRenderTreeNode): string => item.element.id));
  const removedIds = new Set<string>();

  flattenWidgetElementTree(previousElements).forEach((item: WidgetRenderTreeNode): void => {
    if (!nextIds.has(item.element.id)) {
      removedIds.add(item.element.id);
    }
  });

  return removedIds;
}

/**
 * 创建侧栏图层操作处理器。
 * @param options - hook 入参
 * @returns 侧栏图层操作处理器
 */
export function useLayerActions(options: UseLayerActionsOptions): LayerActions {
  const { session, selectedTarget, selectedElementIds, widgetRef } = options;

  /**
   * 选择单个图层元素（供批量选择内部复用）。
   * @param element - 被选择的Widget元素
   */
  function selectSingleElement(element: WidgetElement): void {
    selectedTarget.value = element;
    selectedElementIds.value = [element.id];
    widgetRef.value?.selectElementById(element.id);
  }

  /**
   * 选择一个或多个图层元素。
   * @param elements - 被选择的Widget元素
   */
  function select(elements: WidgetElement[]): void {
    if (elements.length === 1 && elements[0]) {
      selectSingleElement(elements[0]);
      return;
    }

    const elementIds = elements.map((element: WidgetElement): string => element.id);
    if (elementIds.length === 0) {
      return;
    }

    selectedTarget.value = elements.length === 1 ? elements[0] : null;
    selectedElementIds.value = elementIds;
    widgetRef.value?.selectElementsByIds(elementIds);
  }

  /**
   * 复制单个图层元素（供批量复制内部复用）。
   * @param element - 被复制的Widget元素
   */
  async function copySingleElement(element: WidgetElement): Promise<void> {
    const copiedElement = createLayerCopyElement(element, session.data.value.elements);
    session.data.value = {
      ...session.data.value,
      elements: insertLayerCopyAboveSource(session.data.value.elements, element.id, copiedElement)
    };
    selectedTarget.value = copiedElement;
    selectedElementIds.value = [copiedElement.id];
    await nextTick();
    widgetRef.value?.selectElementById(copiedElement.id);
  }

  /**
   * 复制一个或多个图层元素。
   * @param elements - 被复制的Widget元素
   */
  async function copy(elements: WidgetElement[]): Promise<void> {
    if (elements.length === 1 && elements[0]) {
      await copySingleElement(elements[0]);
      return;
    }

    const copiedElements = createLayerCopyElements(elements, session.data.value.elements);
    if (copiedElements.length === 0) {
      return;
    }

    session.data.value = {
      ...session.data.value,
      elements: insertLayerCopiesAboveSources(session.data.value.elements, elements, copiedElements)
    };
    selectedTarget.value = copiedElements.length === 1 ? copiedElements[0] : null;
    selectedElementIds.value = copiedElements.map((element: WidgetElement): string => element.id);
    await nextTick();
    widgetRef.value?.selectElementsByIds(selectedElementIds.value);
  }

  /**
   * 删除单个图层元素（供批量删除内部复用）。
   * @param element - 被删除的Widget元素
   */
  function removeSingleElement(element: WidgetElement): void {
    const previousElements = session.data.value.elements;
    const result = removeElementFromTree(previousElements, element.id);
    if (!result.removed) {
      return;
    }
    const nextElements = removeEmptyWidgetGroups(result.elements);
    const deletedIds = collectRemovedElementIds(previousElements, nextElements);

    session.data.value = {
      ...session.data.value,
      elements: nextElements
    };

    if (isWidgetElementTarget(selectedTarget.value) && deletedIds.has(selectedTarget.value.id)) {
      selectedTarget.value = session.data.value.metadata;
    }
    if (selectedElementIds.value.some((id: string): boolean => deletedIds.has(id))) {
      selectedElementIds.value = [];
    }
  }

  /**
   * 删除一个或多个图层元素。
   * @param elements - 被删除的Widget元素
   */
  function remove(elements: WidgetElement[]): void {
    if (elements.length === 1 && elements[0]) {
      removeSingleElement(elements[0]);
      return;
    }

    const previousElements = session.data.value.elements;
    const deleteIds = new Set(elements.map((element: WidgetElement): string => element.id));
    const nextElements = [...deleteIds].reduce<WidgetElement[]>((currentElements: WidgetElement[], elementId: string): WidgetElement[] => {
      const result = removeElementFromTree(currentElements, elementId);

      return result.elements;
    }, previousElements);
    const compactedElements = removeEmptyWidgetGroups(nextElements);
    const removedIds = collectRemovedElementIds(previousElements, compactedElements);

    if (removedIds.size === 0) {
      return;
    }

    session.data.value = {
      ...session.data.value,
      elements: compactedElements
    };

    if (isWidgetElementTarget(selectedTarget.value) && removedIds.has(selectedTarget.value.id)) {
      selectedTarget.value = session.data.value.metadata;
    }
    if (selectedElementIds.value.some((id: string): boolean => removedIds.has(id))) {
      selectedElementIds.value = [];
    }
  }

  /**
   * 移动单个图层元素（供批量移动内部复用）。
   * @param sourceElementId - 被移动元素 ID
   * @param targetElementId - 目标元素 ID
   * @param position - 基于侧栏视觉顺序的插入位置
   */
  function moveSingleElement(sourceElementId: string, targetElementId: string, position: WidgetLayerMovePosition): void {
    const nextElements = moveLayerElement(session.data.value.elements, sourceElementId, targetElementId, position);
    if (nextElements === session.data.value.elements) {
      return;
    }

    session.data.value = {
      ...session.data.value,
      elements: nextElements
    };
  }

  /**
   * 拖拽排序一个或多个图层元素。
   * @param payload - 移动参数（源 ID 列表、目标 ID 列表、插入位置）
   */
  function move(payload: LayerMovePayload): void {
    const { sourceIds, targetIds, position } = payload;
    if (sourceIds.length === 1 && targetIds.length === 1 && sourceIds[0] && targetIds[0]) {
      moveSingleElement(sourceIds[0], targetIds[0], position);
      return;
    }

    const nextElements = moveLayerElements(session.data.value.elements, sourceIds, targetIds, position);
    if (nextElements === session.data.value.elements) {
      return;
    }

    session.data.value = {
      ...session.data.value,
      elements: nextElements
    };
  }

  return {
    select,
    copy,
    remove,
    move
  };
}

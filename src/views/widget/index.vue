<!--
  @file index.vue
  @description 独立Widget工具页面。
-->
<template>
  <main class="widget-page" tabindex="0" @blur="session.actions.onBlur">
    <PanelSidebar
      v-model:value="session.data.value"
      :active-element-id="activeSidebarElementId"
      :elements="session.data.value.elements"
      :selected-element-ids="selectedElementIds"
      :settings-width="settingsWidth"
      @save="handleSave"
      @select-element="handleSidebarElementSelect"
      @select-elements="handleSidebarElementsSelect"
      @copy-element="handleSidebarElementCopy"
      @copy-elements="handleSidebarElementsCopy"
      @delete-element="handleSidebarElementDelete"
      @delete-elements="handleSidebarElementsDelete"
      @move-element="handleSidebarElementMove"
      @move-elements="handleSidebarElementsMove"
    />

    <section ref="canvasRef" class="widget-page__canvas">
      <BWidget
        ref="widgetRef"
        :select="selectedTarget"
        :value="session.data.value"
        @selection-change="handleWidgetSelectionChange"
        @update:select="handleWidgetSelectUpdate"
        @update:value="handleWidgetDataUpdate"
      />
    </section>

    <BPanelSplitter v-model:size="settingsWidth" position="left" :min-width="220" :max-width="320">
      <PanelSettings
        v-model:value="session.data.value"
        v-model:select="selectedTarget"
        :selected-element-ids="selectedElementIds"
        @multi-command="handleSettingsMultiCommand"
        @multi-layout-change="handleSettingsMultiLayoutChange"
        @multi-style-change="handleSettingsMultiStyleChange"
      />
    </BPanelSplitter>
  </main>
</template>

<script setup lang="ts">
import type { WidgetMultiSelectLayoutChange } from './types';
import { computed, nextTick, onActivated, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { cloneDeep } from 'lodash-es';
import { nanoid } from 'nanoid';
import type BWidgetComponent from '@/components/BWidget/index.vue';
import type { WidgetData, WidgetElement, WidgetElementStyleChange, WidgetLayerAction, WidgetSelectTarget } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import {
  findWidgetElementTreeNode,
  flattenWidgetElementTree,
  isSameWidgetElementParent,
  readWidgetElementChildren,
  removeEmptyWidgetGroups,
  removeWidgetElementFromTree,
  replaceWidgetElementSiblingList,
  updateWidgetElementInTree,
  type WidgetRenderTreeNode
} from '@/components/BWidget/utils/widgetTree';
import { useFileSession } from '@/hooks/useFileSession';
import { useTabsStore } from '@/stores/workspace/tabs';
import PanelSettings from './components/PanelSettings.vue';
import PanelSidebar from './components/PanelSidebar.vue';
import { useBindings } from './hooks/useBindings';
import { provideDragger, useDragger, type DraggerItem, type DraggerPoint } from './hooks/useDragger';
import {
  reorderWidgetLayerElementsByDisplayPosition,
  reorderWidgetLayerElementGroupsByDisplayPosition,
  type WidgetLayerMovePosition
} from './utils/layerOrder';

const route = useRoute();
const tabsStore = useTabsStore();
const fileId = ref(String(route.params.id || ''));
const isActive = ref(true);
const widgetRef = ref<InstanceType<typeof BWidgetComponent>>();
const canvasRef = ref<HTMLElement | null>(null);
const routePath = computed<string>(() => route.fullPath || `/widget/${fileId.value}`);
/** 侧栏复制图层时使用的位置偏移。 */
const WIDGET_LAYER_COPY_OFFSET = 16;
/** 侧栏复制图层时使用的新元素 ID 长度。 */
const WIDGET_LAYER_COPY_ID_SIZE = 8;

const session = useFileSession<WidgetData>({
  fileId,
  kind: 'tibis',
  defaultName: 'Untitled',
  defaultExt: 'tibis',
  defaultData: createDefaultWidgetData(),
  type: 'widget',
  version: 1,
  routeName: 'widget',
  fallbackRouteName: 'editor'
});
/** 右侧设置面板宽度。 */
const settingsWidth = ref(300);
/** 当前右侧设置栏可编辑目标。 */
const selectedTarget = ref<WidgetSelectTarget>(session.data.value.metadata);
/** 当前侧栏需要高亮的元素 ID。 */
const selectedElementIds = ref<string[]>([]);
/**
 * 判断当前设置目标是否为Widget元素。
 * @param target - 当前设置目标
 * @returns 是否为Widget元素
 */
function isWidgetElementTarget(target: WidgetSelectTarget): target is WidgetElement {
  return Boolean(target && typeof target === 'object' && 'id' in target);
}

/** 当前侧栏需要额外高亮的组合子元素 ID。 */
const activeSidebarElementId = computed<string | null>(() => {
  if (!isWidgetElementTarget(selectedTarget.value)) {
    return null;
  }

  return findWidgetElementTreeNode(session.data.value.elements, selectedTarget.value.id)?.parentId ? selectedTarget.value.id : null;
});

/**
 * 右侧多选面板快捷操作命令。
 */
type SettingsMultiCommand = 'copy' | 'group' | 'ungroup' | WidgetLayerAction | 'delete';

/**
 * 多选外接框布局信息。
 */
interface MultiSelectionBounds {
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
 * 右侧设置面板拆分组合结果。
 */
/**
 * 创建侧栏复制元素 ID。
 * @param elements - 当前元素列表
 * @returns 新元素 ID
 */
function createLayerCopyElementId(elements: WidgetElement[]): string {
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
function createLayerCopyElement(element: WidgetElement, elements: WidgetElement[]): WidgetElement {
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
function sortElementsByLayerOrder(elements: WidgetElement[], targetElements: WidgetElement[]): WidgetElement[] {
  const targetIds = new Set(targetElements.map((element: WidgetElement): string => element.id));
  const firstNode = findWidgetElementTreeNode(elements, targetElements[0]?.id ?? '');
  if (!firstNode || !isSameWidgetElementParent(elements, [...targetIds])) {
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
function createLayerCopyElements(targetElements: WidgetElement[], elements: WidgetElement[]): WidgetElement[] {
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
function insertLayerCopyAboveSource(elements: WidgetElement[], sourceElementId: string, copiedElement: WidgetElement): WidgetElement[] {
  const sourceNode = findWidgetElementTreeNode(elements, sourceElementId);
  if (!sourceNode) {
    return [...elements, copiedElement];
  }

  const nextSiblings = [...sourceNode.siblings];
  nextSiblings.splice(sourceNode.index + 1, 0, copiedElement);

  return replaceWidgetElementSiblingList(elements, sourceNode.parentId, nextSiblings);
}

/**
 * 将复制元素列表插入到原元素组上一层。
 * @param elements - 当前元素列表
 * @param sourceElements - 原始元素组 ID 列表
 * @param copiedElements - 复制元素列表
 * @returns 插入后的元素列表
 */
function insertLayerCopiesAboveSources(elements: WidgetElement[], sourceElements: WidgetElement[], copiedElements: WidgetElement[]): WidgetElement[] {
  const orderedSourceElements = sortElementsByLayerOrder(elements, sourceElements);
  const firstNode = findWidgetElementTreeNode(elements, orderedSourceElements[0]?.id ?? '');
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

  return replaceWidgetElementSiblingList(elements, firstNode.parentId, nextSiblings);
}

/**
 * 判断当前多选是否允许批量编辑。
 * @param selectedIds - 当前多选元素 ID 集合
 * @returns 是否属于同一个直接父级
 */
function canEditMultiSelection(selectedIds: Set<string>): boolean {
  return selectedIds.size > 1 && isSameWidgetElementParent(session.data.value.elements, [...selectedIds]);
}

/**
 * 根据当前设置目标同步侧栏高亮选区。
 * @param target - 当前设置目标
 */
function syncSidebarSelectedElementIds(target: WidgetSelectTarget): void {
  if (isWidgetElementTarget(target)) {
    selectedElementIds.value = [target.id];
    return;
  }

  if (target !== null) {
    selectedElementIds.value = [];
  }
}

/**
 * 根据最新元素树刷新当前设置面板选中目标。
 */
function syncSelectedTargetFromElementTree(): void {
  if (!isWidgetElementTarget(selectedTarget.value)) {
    return;
  }

  const nextElement = findWidgetElementTreeNode(session.data.value.elements, selectedTarget.value.id)?.element;
  selectedTarget.value = nextElement ?? session.data.value.metadata;
}

/**
 * 处理Widget内部数据更新。
 * @param data - 最新Widget数据
 */
function handleWidgetDataUpdate(data: WidgetData): void {
  session.data.value = data;
  syncSelectedTargetFromElementTree();
}

/**
 * 处理Widget内部设置目标更新。
 * @param target - 最新设置目标
 */
function handleWidgetSelectUpdate(target: WidgetSelectTarget): void {
  selectedTarget.value = target;
}

/**
 * 处理Widget内部选区同步。
 * @param selection - 当前Widget选区 ID 列表
 */
function handleWidgetSelectionChange(selection: string[]): void {
  selectedElementIds.value = [...selection];

  if (settingsWidth.value === 0 && selectedElementIds.value.length) {
    settingsWidth.value = 300;
  }
}

/**
 * 保存当前 Widget 文件（由侧栏运行脚本编辑器 Ctrl+S 触发）。
 */
async function handleSave(): Promise<void> {
  await session.actions.onSave();
}

/**
 * 将当前Widget文件同步到标签页列表。
 */
function syncWidgetTab(): void {
  if (!fileId.value) {
    return;
  }

  tabsStore.addTab({
    id: fileId.value,
    path: routePath.value,
    title: session.currentTitle.value,
    cacheKey: `widget:${fileId.value}`
  });
}

const elementDrag = useDragger({
  dropTargetRef: canvasRef,
  onDrop: (item: DraggerItem, point: DraggerPoint): void => {
    widgetRef.value?.createElementFromClientPoint(item.name, point);
  }
});
provideDragger(elementDrag);

/**
 * 处理侧栏图层选择。
 * @param element - 被选择的Widget元素
 */
function handleSidebarElementSelect(element: WidgetElement): void {
  selectedTarget.value = element;
  selectedElementIds.value = [element.id];
  widgetRef.value?.selectElementById(element.id);
}

/**
 * 处理侧栏图层多选。
 * @param elements - 被选择的Widget元素
 */
function handleSidebarElementsSelect(elements: WidgetElement[]): void {
  const elementIds = elements.map((element: WidgetElement): string => element.id);
  if (elementIds.length === 0) {
    return;
  }

  selectedTarget.value = elements.length === 1 ? elements[0] : null;
  selectedElementIds.value = elementIds;
  widgetRef.value?.selectElementsByIds(elementIds);
}

/**
 * 处理侧栏图层复制。
 * @param element - 被复制的Widget元素
 */
async function handleSidebarElementCopy(element: WidgetElement): Promise<void> {
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
 * 处理侧栏多图层复制。
 * @param elements - 被复制的Widget元素
 */
async function handleSidebarElementsCopy(elements: WidgetElement[]): Promise<void> {
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
 * 处理右侧多选面板快捷操作。
 * @param command - 快捷操作命令
 * @returns Promise
 */
async function handleSettingsMultiCommand(command: SettingsMultiCommand): Promise<void> {
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
 * 创建多选元素外接框。
 * @param elements - 目标多选元素列表
 * @returns 多选元素外接框，空列表返回 null
 */
function createMultiSelectionBounds(elements: WidgetElement[]): MultiSelectionBounds | null {
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
function normalizeMultiSelectLayoutValue(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * 按布局变更创建目标外接框。
 * @param bounds - 当前外接框
 * @param layout - 布局变更
 * @returns 目标外接框，非法尺寸返回 null
 */
function createNextMultiSelectionBounds(bounds: MultiSelectionBounds, layout: WidgetMultiSelectLayoutChange): MultiSelectionBounds | null {
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
function transformElementByMultiSelectionBounds(element: WidgetElement, currentBounds: MultiSelectionBounds, nextBounds: MultiSelectionBounds): WidgetElement {
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
function isWidgetElementGeometryLocked(element: WidgetElement): boolean {
  return element.locked === true;
}

/**
 * 按 ID 从元素树读取选中元素。
 * @param elements - 当前Widget元素树
 * @param selectedIds - 当前选中元素 ID 集合
 * @returns 选中元素列表
 */
function getSelectedElementsInTree(elements: WidgetElement[], selectedIds: Set<string>): WidgetElement[] {
  return flattenWidgetElementTree(elements)
    .filter((item: WidgetRenderTreeNode): boolean => selectedIds.has(item.element.id))
    .map((item: WidgetRenderTreeNode): WidgetElement => item.element);
}

/**
 * 批量更新选中元素布局。
 * @param elements - 当前Widget元素列表
 * @param selectedIds - 当前多选元素 ID 列表
 * @param layout - 布局变更
 * @returns 更新布局后的元素列表
 */
function updateSelectedElementLayouts(elements: WidgetElement[], selectedIds: Set<string>, layout: WidgetMultiSelectLayoutChange): WidgetElement[] {
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
      updateWidgetElementInTree(
        nextElements,
        element.id,
        (currentElement: WidgetElement): WidgetElement => transformElementByMultiSelectionBounds(currentElement, currentBounds, nextBounds)
      ),
    elements
  );
}

/**
 * 处理右侧多选面板布局批量变更。
 * @param layout - 布局变更
 */
function handleSettingsMultiLayoutChange(layout: WidgetMultiSelectLayoutChange): void {
  const selectedIds = new Set(selectedElementIds.value);
  if (!canEditMultiSelection(selectedIds)) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: updateSelectedElementLayouts(session.data.value.elements, selectedIds, layout)
  };
}

/**
 * 批量合并选中元素样式。
 * @param elements - 当前Widget元素列表
 * @param selectedIds - 当前多选元素 ID 集合
 * @param style - 样式变更
 * @returns 合并样式后的元素列表
 */
function mergeSelectedElementStyles(elements: WidgetElement[], selectedIds: Set<string>, style: WidgetElementStyleChange): WidgetElement[] {
  return getSelectedElementsInTree(elements, selectedIds).reduce<WidgetElement[]>(
    (nextElements: WidgetElement[], element: WidgetElement): WidgetElement[] =>
      updateWidgetElementInTree(
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
 * 处理右侧多选面板样式批量变更。
 * @param style - 样式变更
 */
function handleSettingsMultiStyleChange(style: WidgetElementStyleChange): void {
  const selectedIds = new Set(selectedElementIds.value);
  if (!canEditMultiSelection(selectedIds)) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: mergeSelectedElementStyles(session.data.value.elements, selectedIds, style)
  };
}

/**
 * 计算元素树更新后被移除的节点 ID。
 * @param previousElements - 更新前元素树
 * @param nextElements - 更新后元素树
 * @returns 被移除节点 ID 集合
 */
function collectRemovedElementIds(previousElements: WidgetElement[], nextElements: WidgetElement[]): Set<string> {
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
 * 处理侧栏图层删除。
 * @param element - 被删除的Widget元素
 */
function handleSidebarElementDelete(element: WidgetElement): void {
  const previousElements = session.data.value.elements;
  const result = removeWidgetElementFromTree(previousElements, element.id);
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
 * 处理侧栏多图层删除。
 * @param elements - 被删除的Widget元素
 */
function handleSidebarElementsDelete(elements: WidgetElement[]): void {
  const previousElements = session.data.value.elements;
  const deleteIds = new Set(elements.map((element: WidgetElement): string => element.id));
  const nextElements = [...deleteIds].reduce<WidgetElement[]>((currentElements: WidgetElement[], elementId: string): WidgetElement[] => {
    const result = removeWidgetElementFromTree(currentElements, elementId);

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
 * 处理侧栏图层拖拽排序。
 * @param sourceElementId - 被移动元素 ID
 * @param targetElementId - 目标元素 ID
 * @param position - 基于侧栏视觉顺序的插入位置
 */
function handleSidebarElementMove(sourceElementId: string, targetElementId: string, position: WidgetLayerMovePosition): void {
  const nextElements = reorderWidgetLayerElementsByDisplayPosition(session.data.value.elements, sourceElementId, targetElementId, position);
  if (nextElements === session.data.value.elements) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: nextElements
  };
}

/**
 * 处理侧栏多图层拖拽排序。
 * @param sourceElementIds - 被移动元素 ID 列表
 * @param targetElementIds - 目标元素 ID 列表
 * @param position - 基于侧栏视觉顺序的插入位置
 */
function handleSidebarElementsMove(sourceElementIds: string[], targetElementIds: string[], position: WidgetLayerMovePosition): void {
  const nextElements = reorderWidgetLayerElementGroupsByDisplayPosition(session.data.value.elements, sourceElementIds, targetElementIds, position);
  if (nextElements === session.data.value.elements) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: nextElements
  };
}

watch(selectedTarget, syncSidebarSelectedElementIds, { immediate: true });
watch(() => session.data.value.elements, syncSelectedTargetFromElementTree, { deep: true });
watch([fileId, session.currentTitle], syncWidgetTab, { immediate: true });

useBindings({
  isActive,
  actions: session.actions
});

onActivated((): void => {
  isActive.value = true;
});

onDeactivated((): void => {
  isActive.value = false;
});
</script>

<style lang="less" scoped>
.widget-page {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: 8px;
}

.widget-page__canvas {
  display: flex;
  flex: 1;
  width: 0;
  min-width: 0;
  min-height: 0;
}
</style>

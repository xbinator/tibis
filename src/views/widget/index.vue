<!--
  @file index.vue
  @description 独立Widget工具页面。
-->
<template>
  <main class="widget-page" tabindex="0" @blur="session.actions.onBlur">
    <PanelSidebar
      :active-element-id="activeSidebarElementId"
      :elements="session.data.value.elements"
      :selected-element-ids="selectedElementIds"
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
      <BWidget ref="widgetRef" v-model:value="session.data.value" v-model:select="selectedTarget" @selection-change="handleWidgetSelectionChange" />
    </section>

    <BPanelSplitter v-model:size="settingsWidth" position="left" :closable="false" :min-width="360" :max-width="400">
      <PanelSettings
        v-model:value="session.data.value"
        v-model:select="selectedTarget"
        :selected-element-ids="selectedElementIds"
        @edit-code="handleCodeEdit"
        @multi-command="handleSettingsMultiCommand"
        @multi-layout-change="handleSettingsMultiLayoutChange"
        @multi-style-change="handleSettingsMultiStyleChange"
      />
    </BPanelSplitter>

    <div class="widget-page__code-overlay" :class="{ 'is-open': isCodeEditorOpen }">
      <CodeEditor v-model:value="session.data.value" :active="isCodeEditorOpen" @close="handleCodeClose" />
    </div>
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
import { WIDGET_GROUP_METADATA_KEY, getWidgetElementGroupId } from '@/components/BWidget/utils/widgetGroups';
import { useFileSession } from '@/hooks/useFileSession';
import { useTabsStore } from '@/stores/workspace/tabs';
import CodeEditor from './components/CodeEditor.vue';
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
const isCodeEditorOpen = ref(false);
const widgetRef = ref<InstanceType<typeof BWidgetComponent>>();
const canvasRef = ref<HTMLElement | null>(null);
const routePath = computed<string>(() => route.fullPath || `/widget/${fileId.value}`);
/** 侧栏复制图层时使用的位置偏移。 */
const WIDGET_LAYER_COPY_OFFSET = 16;
/** 侧栏复制图层时使用的新元素 ID 长度。 */
const WIDGET_LAYER_COPY_ID_SIZE = 8;
/** 侧栏复制组合时使用的组合 ID 前缀。 */
const WIDGET_LAYER_COPY_GROUP_ID_PREFIX = 'widget-group-';

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
/** 当前右侧设置栏可编辑目标。 */
/** 右侧设置面板宽度。 */
const settingsWidth = ref(360);
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

  return getWidgetElementGroupId(selectedTarget.value) ? selectedTarget.value.id : null;
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
interface SettingsUngroupResult {
  /** 拆分后的元素列表 */
  elements: WidgetElement[];
  /** 拆分后应保持选中的元素 ID 列表 */
  selectedElementIds: string[];
  /** 是否实际拆分了组合 */
  changed: boolean;
}

/**
 * 读取自动生成组合 ID 中的序号。
 * @param groupId - 组合 ID
 * @returns 序号，不匹配时返回 null
 */
function getGeneratedGroupIdIndex(groupId: string): number | null {
  if (!groupId.startsWith(WIDGET_LAYER_COPY_GROUP_ID_PREFIX)) {
    return null;
  }

  const rawIndex = groupId.slice(WIDGET_LAYER_COPY_GROUP_ID_PREFIX.length);
  if (!/^\d+$/.test(rawIndex)) {
    return null;
  }

  return Number(rawIndex);
}

/**
 * 创建侧栏复制元素 ID。
 * @param elements - 当前元素列表
 * @returns 新元素 ID
 */
function createLayerCopyElementId(elements: WidgetElement[]): string {
  const existingIds = new Set(elements.map((element: WidgetElement): string => element.id));
  let nextId = nanoid(WIDGET_LAYER_COPY_ID_SIZE);

  while (existingIds.has(nextId)) {
    nextId = nanoid(WIDGET_LAYER_COPY_ID_SIZE);
  }

  return nextId;
}

/**
 * 创建侧栏复制组合 ID。
 * @param elements - 当前元素列表
 * @returns 新组合 ID
 */
function createLayerCopyGroupId(elements: WidgetElement[]): string {
  const existingGroupIds = new Set(
    elements.map((element: WidgetElement): string | null => getWidgetElementGroupId(element)).filter((groupId): groupId is string => groupId !== null)
  );
  let nextIndex = elements.reduce<number>((maxIndex: number, element: WidgetElement): number => {
    const groupId = getWidgetElementGroupId(element);
    const index = groupId ? getGeneratedGroupIdIndex(groupId) : null;

    return index === null ? maxIndex : Math.max(maxIndex, index);
  }, 0);
  let nextGroupId = `${WIDGET_LAYER_COPY_GROUP_ID_PREFIX}${nextIndex + 1}`;

  while (existingGroupIds.has(nextGroupId)) {
    nextIndex += 1;
    nextGroupId = `${WIDGET_LAYER_COPY_GROUP_ID_PREFIX}${nextIndex + 1}`;
  }

  return nextGroupId;
}

/**
 * 移除Widget元素元数据中的组合 ID。
 * @param metadata - 原始元素元数据
 * @returns 移除组合 ID 后的元素元数据
 */
function removeWidgetElementGroupId(metadata: WidgetElement['metadata']): WidgetElement['metadata'] {
  const nextMetadata = cloneDeep(metadata);
  delete nextMetadata[WIDGET_GROUP_METADATA_KEY];

  return nextMetadata;
}

/**
 * 按右侧设置面板当前多选 ID 拆分命中的组合。
 * @param elements - 当前Widget元素列表
 * @param selectedIds - 当前设置面板多选 ID 集合
 * @returns 拆分结果
 */
function createSettingsUngroupResult(elements: WidgetElement[], selectedIds: Set<string>): SettingsUngroupResult {
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

  if (groupIds.size === 0) {
    return {
      elements,
      selectedElementIds: [...selectedIds],
      changed: false
    };
  }

  const ungroupedElementIds: string[] = [];
  const nextElements = elements.map((element: WidgetElement): WidgetElement => {
    const groupId = getWidgetElementGroupId(element);
    if (!groupId || !groupIds.has(groupId)) {
      return element;
    }

    ungroupedElementIds.push(element.id);
    return {
      ...element,
      metadata: removeWidgetElementGroupId(element.metadata)
    };
  });

  return {
    elements: nextElements,
    selectedElementIds: ungroupedElementIds,
    changed: true
  };
}

/**
 * 创建侧栏复制出来的独立元素。
 * @param element - 原始元素
 * @param elements - 当前元素列表
 * @returns 新Widget元素
 */
function createLayerCopyElement(element: WidgetElement, elements: WidgetElement[]): WidgetElement {
  const nextElement = cloneDeep(element);
  delete nextElement.metadata[WIDGET_GROUP_METADATA_KEY];

  return {
    ...nextElement,
    id: createLayerCopyElementId(elements),
    position: {
      x: element.position.x + WIDGET_LAYER_COPY_OFFSET,
      y: element.position.y + WIDGET_LAYER_COPY_OFFSET
    }
  };
}

/**
 * 按当前Widget层级顺序整理目标元素。
 * @param elements - 当前元素列表
 * @param targetElements - 目标元素列表
 * @returns 按Widget层级排序后的目标元素
 */
function sortElementsByLayerOrder(elements: WidgetElement[], targetElements: WidgetElement[]): WidgetElement[] {
  const targetIds = new Set(targetElements.map((element: WidgetElement): string => element.id));

  return elements.filter((element: WidgetElement): boolean => targetIds.has(element.id));
}

/**
 * 创建侧栏复制出来的元素列表。
 * @param targetElements - 原始元素列表
 * @param elements - 当前元素列表
 * @returns 新Widget元素列表
 */
function createLayerCopyElements(targetElements: WidgetElement[], elements: WidgetElement[]): WidgetElement[] {
  const orderedElements = sortElementsByLayerOrder(elements, targetElements);
  const groupIds = new Set(
    orderedElements.map((element: WidgetElement): string | null => getWidgetElementGroupId(element)).filter((groupId): groupId is string => groupId !== null)
  );
  const nextGroupId = orderedElements.length > 1 && groupIds.size === 1 ? createLayerCopyGroupId(elements) : null;
  const elementsWithCopies = [...elements];

  return orderedElements.map((element: WidgetElement): WidgetElement => {
    const copiedElement = createLayerCopyElement(element, elementsWithCopies);
    if (nextGroupId) {
      copiedElement.metadata = {
        ...copiedElement.metadata,
        [WIDGET_GROUP_METADATA_KEY]: nextGroupId
      };
    }

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
  const sourceIndex = elements.findIndex((element: WidgetElement): boolean => element.id === sourceElementId);
  if (sourceIndex === -1) {
    return [...elements, copiedElement];
  }

  const nextElements = [...elements];
  nextElements.splice(sourceIndex + 1, 0, copiedElement);

  return nextElements;
}

/**
 * 将复制元素列表插入到原元素组上一层。
 * @param elements - 当前元素列表
 * @param sourceElements - 原始元素列表
 * @param copiedElements - 复制元素列表
 * @returns 插入后的元素列表
 */
function insertLayerCopiesAboveSources(elements: WidgetElement[], sourceElements: WidgetElement[], copiedElements: WidgetElement[]): WidgetElement[] {
  const sourceIds = new Set(sourceElements.map((element: WidgetElement): string => element.id));
  const sourceIndexes = elements
    .map((element: WidgetElement, index: number): number => (sourceIds.has(element.id) ? index : -1))
    .filter((index: number): boolean => index >= 0);
  if (sourceIndexes.length === 0) {
    return [...elements, ...copiedElements];
  }

  const nextElements = [...elements];
  nextElements.splice(Math.max(...sourceIndexes) + 1, 0, ...copiedElements);

  return nextElements;
}

/**
 * 根据当前设置目标同步侧栏高亮选区。
 * @param target - 当前设置目标
 */
function syncSidebarSelectedElementIds(target: WidgetSelectTarget): void {
  if (isWidgetElementTarget(target)) {
    if (getWidgetElementGroupId(target)) {
      return;
    }

    selectedElementIds.value = [target.id];
    return;
  }

  if (target !== null) {
    selectedElementIds.value = [];
  }
}

/**
 * 处理Widget内部选区同步。
 * @param selection - 当前Widget选区 ID 列表
 */
function handleWidgetSelectionChange(selection: string[]): void {
  selectedElementIds.value = [...selection];
}

/**
 * 打开当前 Widget 的运行代码当前页编辑器。
 */
function handleCodeEdit(): void {
  isCodeEditorOpen.value = true;
}

/**
 * 关闭运行代码当前页编辑器。
 */
function handleCodeClose(): void {
  isCodeEditorOpen.value = false;
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
  if (getWidgetElementGroupId(element)) {
    widgetRef.value?.selectElementById(element.id, { activateElement: true });
    return;
  }

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
      const result = createSettingsUngroupResult(session.data.value.elements, new Set(selectedElementIds.value));
      if (result.changed) {
        session.data.value = {
          ...session.data.value,
          elements: result.elements
        };
        selectedElementIds.value = result.selectedElementIds;
        await nextTick();
        widgetRef.value?.selectElementsByIds(result.selectedElementIds);
        break;
      }

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
 * @returns 多选外接框，空列表返回 null
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
 * 批量更新选中元素布局。
 * @param elements - 当前Widget元素列表
 * @param selectedIds - 当前多选元素 ID 集合
 * @param layout - 布局变更
 * @returns 更新布局后的元素列表
 */
function updateSelectedElementLayouts(elements: WidgetElement[], selectedIds: Set<string>, layout: WidgetMultiSelectLayoutChange): WidgetElement[] {
  const selectedElements = elements.filter((element: WidgetElement): boolean => selectedIds.has(element.id));
  const currentBounds = createMultiSelectionBounds(selectedElements);
  if (!currentBounds) {
    return elements;
  }

  const nextBounds = createNextMultiSelectionBounds(currentBounds, layout);
  if (!nextBounds) {
    return elements;
  }

  return elements.map((element: WidgetElement): WidgetElement => {
    if (!selectedIds.has(element.id)) {
      return element;
    }

    return transformElementByMultiSelectionBounds(element, currentBounds, nextBounds);
  });
}

/**
 * 处理右侧多选面板布局批量变更。
 * @param layout - 布局变更
 */
function handleSettingsMultiLayoutChange(layout: WidgetMultiSelectLayoutChange): void {
  const selectedIds = new Set(selectedElementIds.value);
  if (selectedIds.size === 0) {
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
  return elements.map((element: WidgetElement): WidgetElement => {
    if (!selectedIds.has(element.id)) {
      return element;
    }

    return {
      ...element,
      style: {
        ...element.style,
        ...style
      }
    };
  });
}

/**
 * 处理右侧多选面板样式批量变更。
 * @param style - 样式变更
 */
function handleSettingsMultiStyleChange(style: WidgetElementStyleChange): void {
  const selectedIds = new Set(selectedElementIds.value);
  if (selectedIds.size === 0) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: mergeSelectedElementStyles(session.data.value.elements, selectedIds, style)
  };
}

/**
 * 处理侧栏图层删除。
 * @param element - 被删除的Widget元素
 */
function handleSidebarElementDelete(element: WidgetElement): void {
  const nextElements = session.data.value.elements.filter((item: WidgetElement): boolean => item.id !== element.id);
  if (nextElements.length === session.data.value.elements.length) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: nextElements
  };

  if (isWidgetElementTarget(selectedTarget.value) && selectedTarget.value.id === element.id) {
    selectedTarget.value = session.data.value.metadata;
  }
  if (selectedElementIds.value.includes(element.id)) {
    selectedElementIds.value = [];
  }
}

/**
 * 处理侧栏多图层删除。
 * @param elements - 被删除的Widget元素
 */
function handleSidebarElementsDelete(elements: WidgetElement[]): void {
  const deleteIds = new Set(elements.map((element: WidgetElement): string => element.id));
  const nextElements = session.data.value.elements.filter((item: WidgetElement): boolean => !deleteIds.has(item.id));
  if (nextElements.length === session.data.value.elements.length) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: nextElements
  };

  if (isWidgetElementTarget(selectedTarget.value) && deleteIds.has(selectedTarget.value.id)) {
    selectedTarget.value = session.data.value.metadata;
  }
  if (selectedElementIds.value.some((id: string): boolean => deleteIds.has(id))) {
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
  padding: 8px 0;
}

.widget-page__code-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  visibility: hidden;
  pointer-events: none;
  background: var(--bg-primary);
  opacity: 0;
}

.widget-page__code-overlay.is-open {
  visibility: visible;
  pointer-events: auto;
  opacity: 1;
}
</style>

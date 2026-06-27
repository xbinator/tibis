<!--
  @file index.vue
  @description 独立画图工具页面。
-->
<template>
  <main class="drawing-page" tabindex="0" @blur="session.actions.onBlur">
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

    <section ref="canvasRef" class="drawing-page__canvas">
      <BDrawing ref="drawingRef" v-model:value="session.data.value" v-model:select="selectedTarget" @selection-change="handleDrawingSelectionChange" />
    </section>

    <PanelSettings v-model:select="selectedTarget" :drawing-data="session.data.value" />
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { cloneDeep } from 'lodash-es';
import { nanoid } from 'nanoid';
import type BDrawingComponent from '@/components/BDrawing/index.vue';
import type { DrawingData, DrawingElement, DrawingSelectTarget } from '@/components/BDrawing/types';
import { DRAWING_GROUP_METADATA_KEY, getDrawingElementGroupId } from '@/components/BDrawing/utils/drawingGroups';
import { useFileSession } from '@/hooks/useFileSession';
import { useTabsStore } from '@/stores/workspace/tabs';
import PanelSettings from './components/PanelSettings.vue';
import PanelSidebar from './components/PanelSidebar.vue';
import { useBindings } from './hooks/useBindings';
import { provideDragger, useDragger, type DraggerItem, type DraggerPoint } from './hooks/useDragger';
import {
  reorderDrawingLayerElementsByDisplayPosition,
  reorderDrawingLayerElementGroupsByDisplayPosition,
  type DrawingLayerMovePosition
} from './utils/layerOrder';

const route = useRoute();
const tabsStore = useTabsStore();
const fileId = ref(String(route.params.id || ''));
const isActive = ref(true);
const drawingRef = ref<InstanceType<typeof BDrawingComponent>>();
const canvasRef = ref<HTMLElement | null>(null);
const routePath = computed<string>(() => route.fullPath || `/drawing/${fileId.value}`);
/** 侧栏复制图层时使用的位置偏移。 */
const DRAWING_LAYER_COPY_OFFSET = 16;
/** 侧栏复制图层时使用的新元素 ID 长度。 */
const DRAWING_LAYER_COPY_ID_SIZE = 8;
/** 侧栏复制组合时使用的组合 ID 前缀。 */
const DRAWING_LAYER_COPY_GROUP_ID_PREFIX = 'drawing-group-';

const session = useFileSession<DrawingData>({
  fileId,
  kind: 'tibis',
  defaultName: 'Untitled',
  defaultExt: 'tibis',
  defaultData: { metadata: {}, elements: [], viewport: { center: { x: 0, y: 0 }, zoom: 1 } },
  type: 'drawing',
  version: 1,
  routeName: 'drawing',
  fallbackRouteName: 'editor'
});
/** 当前右侧设置栏可编辑目标。 */
const selectedTarget = ref<DrawingSelectTarget>(session.data.value.metadata);
/** 当前侧栏需要高亮的元素 ID。 */
const selectedElementIds = ref<string[]>([]);

/**
 * 判断当前设置目标是否为画图元素。
 * @param target - 当前设置目标
 * @returns 是否为画图元素
 */
function isDrawingElementTarget(target: DrawingSelectTarget): target is DrawingElement {
  return Boolean(target && typeof target === 'object' && 'id' in target);
}

/** 当前侧栏需要额外高亮的组合子元素 ID。 */
const activeSidebarElementId = computed<string | null>(() => {
  if (!isDrawingElementTarget(selectedTarget.value)) {
    return null;
  }

  return getDrawingElementGroupId(selectedTarget.value) ? selectedTarget.value.id : null;
});

/**
 * 读取自动生成组合 ID 中的序号。
 * @param groupId - 组合 ID
 * @returns 序号，不匹配时返回 null
 */
function getGeneratedGroupIdIndex(groupId: string): number | null {
  if (!groupId.startsWith(DRAWING_LAYER_COPY_GROUP_ID_PREFIX)) {
    return null;
  }

  const rawIndex = groupId.slice(DRAWING_LAYER_COPY_GROUP_ID_PREFIX.length);
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
function createLayerCopyElementId(elements: DrawingElement[]): string {
  const existingIds = new Set(elements.map((element: DrawingElement): string => element.id));
  let nextId = nanoid(DRAWING_LAYER_COPY_ID_SIZE);

  while (existingIds.has(nextId)) {
    nextId = nanoid(DRAWING_LAYER_COPY_ID_SIZE);
  }

  return nextId;
}

/**
 * 创建侧栏复制组合 ID。
 * @param elements - 当前元素列表
 * @returns 新组合 ID
 */
function createLayerCopyGroupId(elements: DrawingElement[]): string {
  const existingGroupIds = new Set(
    elements.map((element: DrawingElement): string | null => getDrawingElementGroupId(element)).filter((groupId): groupId is string => groupId !== null)
  );
  let nextIndex = elements.reduce<number>((maxIndex: number, element: DrawingElement): number => {
    const groupId = getDrawingElementGroupId(element);
    const index = groupId ? getGeneratedGroupIdIndex(groupId) : null;

    return index === null ? maxIndex : Math.max(maxIndex, index);
  }, 0);
  let nextGroupId = `${DRAWING_LAYER_COPY_GROUP_ID_PREFIX}${nextIndex + 1}`;

  while (existingGroupIds.has(nextGroupId)) {
    nextIndex += 1;
    nextGroupId = `${DRAWING_LAYER_COPY_GROUP_ID_PREFIX}${nextIndex + 1}`;
  }

  return nextGroupId;
}

/**
 * 创建侧栏复制出来的独立元素。
 * @param element - 原始元素
 * @param elements - 当前元素列表
 * @returns 新画图元素
 */
function createLayerCopyElement(element: DrawingElement, elements: DrawingElement[]): DrawingElement {
  const nextElement = cloneDeep(element);
  delete nextElement.metadata[DRAWING_GROUP_METADATA_KEY];

  return {
    ...nextElement,
    id: createLayerCopyElementId(elements),
    position: {
      x: element.position.x + DRAWING_LAYER_COPY_OFFSET,
      y: element.position.y + DRAWING_LAYER_COPY_OFFSET
    }
  };
}

/**
 * 按当前画布层级顺序整理目标元素。
 * @param elements - 当前元素列表
 * @param targetElements - 目标元素列表
 * @returns 按画布层级排序后的目标元素
 */
function sortElementsByLayerOrder(elements: DrawingElement[], targetElements: DrawingElement[]): DrawingElement[] {
  const targetIds = new Set(targetElements.map((element: DrawingElement): string => element.id));

  return elements.filter((element: DrawingElement): boolean => targetIds.has(element.id));
}

/**
 * 创建侧栏复制出来的元素列表。
 * @param targetElements - 原始元素列表
 * @param elements - 当前元素列表
 * @returns 新画图元素列表
 */
function createLayerCopyElements(targetElements: DrawingElement[], elements: DrawingElement[]): DrawingElement[] {
  const orderedElements = sortElementsByLayerOrder(elements, targetElements);
  const groupIds = new Set(
    orderedElements.map((element: DrawingElement): string | null => getDrawingElementGroupId(element)).filter((groupId): groupId is string => groupId !== null)
  );
  const nextGroupId = orderedElements.length > 1 && groupIds.size === 1 ? createLayerCopyGroupId(elements) : null;
  const elementsWithCopies = [...elements];

  return orderedElements.map((element: DrawingElement): DrawingElement => {
    const copiedElement = createLayerCopyElement(element, elementsWithCopies);
    if (nextGroupId) {
      copiedElement.metadata = {
        ...copiedElement.metadata,
        [DRAWING_GROUP_METADATA_KEY]: nextGroupId
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
function insertLayerCopyAboveSource(elements: DrawingElement[], sourceElementId: string, copiedElement: DrawingElement): DrawingElement[] {
  const sourceIndex = elements.findIndex((element: DrawingElement): boolean => element.id === sourceElementId);
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
function insertLayerCopiesAboveSources(elements: DrawingElement[], sourceElements: DrawingElement[], copiedElements: DrawingElement[]): DrawingElement[] {
  const sourceIds = new Set(sourceElements.map((element: DrawingElement): string => element.id));
  const sourceIndexes = elements
    .map((element: DrawingElement, index: number): number => (sourceIds.has(element.id) ? index : -1))
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
function syncSidebarSelectedElementIds(target: DrawingSelectTarget): void {
  if (isDrawingElementTarget(target)) {
    if (getDrawingElementGroupId(target)) {
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
 * 处理画布内部选区同步。
 * @param selection - 当前画布选区 ID 列表
 */
function handleDrawingSelectionChange(selection: string[]): void {
  selectedElementIds.value = [...selection];
}

/**
 * 将当前画图文件同步到标签页列表。
 */
function syncDrawingTab(): void {
  if (!fileId.value) {
    return;
  }

  tabsStore.addTab({
    id: fileId.value,
    path: routePath.value,
    title: session.currentTitle.value,
    cacheKey: `drawing:${fileId.value}`
  });
}

const elementDrag = useDragger({
  dropTargetRef: canvasRef,
  onDrop: (item: DraggerItem, point: DraggerPoint): void => {
    drawingRef.value?.createElementFromClientPoint(item.name, point);
  }
});
provideDragger(elementDrag);

/**
 * 处理侧栏图层选择。
 * @param element - 被选择的画图元素
 */
function handleSidebarElementSelect(element: DrawingElement): void {
  selectedTarget.value = element;
  selectedElementIds.value = [element.id];
  if (getDrawingElementGroupId(element)) {
    drawingRef.value?.selectElementById(element.id, { activateElement: true });
    return;
  }

  drawingRef.value?.selectElementById(element.id);
}

/**
 * 处理侧栏图层多选。
 * @param elements - 被选择的画图元素
 */
function handleSidebarElementsSelect(elements: DrawingElement[]): void {
  const elementIds = elements.map((element: DrawingElement): string => element.id);
  if (elementIds.length === 0) {
    return;
  }

  selectedTarget.value = elements.length === 1 ? elements[0] : null;
  selectedElementIds.value = elementIds;
  drawingRef.value?.selectElementsByIds(elementIds);
}

/**
 * 处理侧栏图层复制。
 * @param element - 被复制的画图元素
 */
async function handleSidebarElementCopy(element: DrawingElement): Promise<void> {
  const copiedElement = createLayerCopyElement(element, session.data.value.elements);
  session.data.value = {
    ...session.data.value,
    elements: insertLayerCopyAboveSource(session.data.value.elements, element.id, copiedElement)
  };
  selectedTarget.value = copiedElement;
  selectedElementIds.value = [copiedElement.id];
  await nextTick();
  drawingRef.value?.selectElementById(copiedElement.id);
}

/**
 * 处理侧栏多图层复制。
 * @param elements - 被复制的画图元素
 */
async function handleSidebarElementsCopy(elements: DrawingElement[]): Promise<void> {
  const copiedElements = createLayerCopyElements(elements, session.data.value.elements);
  if (copiedElements.length === 0) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: insertLayerCopiesAboveSources(session.data.value.elements, elements, copiedElements)
  };
  selectedTarget.value = copiedElements.length === 1 ? copiedElements[0] : null;
  selectedElementIds.value = copiedElements.map((element: DrawingElement): string => element.id);
  await nextTick();
  drawingRef.value?.selectElementsByIds(selectedElementIds.value);
}

/**
 * 处理侧栏图层删除。
 * @param element - 被删除的画图元素
 */
function handleSidebarElementDelete(element: DrawingElement): void {
  const nextElements = session.data.value.elements.filter((item: DrawingElement): boolean => item.id !== element.id);
  if (nextElements.length === session.data.value.elements.length) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: nextElements
  };

  if (isDrawingElementTarget(selectedTarget.value) && selectedTarget.value.id === element.id) {
    selectedTarget.value = session.data.value.metadata;
  }
  if (selectedElementIds.value.includes(element.id)) {
    selectedElementIds.value = [];
  }
}

/**
 * 处理侧栏多图层删除。
 * @param elements - 被删除的画图元素
 */
function handleSidebarElementsDelete(elements: DrawingElement[]): void {
  const deleteIds = new Set(elements.map((element: DrawingElement): string => element.id));
  const nextElements = session.data.value.elements.filter((item: DrawingElement): boolean => !deleteIds.has(item.id));
  if (nextElements.length === session.data.value.elements.length) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: nextElements
  };

  if (isDrawingElementTarget(selectedTarget.value) && deleteIds.has(selectedTarget.value.id)) {
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
function handleSidebarElementMove(sourceElementId: string, targetElementId: string, position: DrawingLayerMovePosition): void {
  const nextElements = reorderDrawingLayerElementsByDisplayPosition(session.data.value.elements, sourceElementId, targetElementId, position);
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
function handleSidebarElementsMove(sourceElementIds: string[], targetElementIds: string[], position: DrawingLayerMovePosition): void {
  const nextElements = reorderDrawingLayerElementGroupsByDisplayPosition(session.data.value.elements, sourceElementIds, targetElementIds, position);
  if (nextElements === session.data.value.elements) {
    return;
  }

  session.data.value = {
    ...session.data.value,
    elements: nextElements
  };
}

watch(selectedTarget, syncSidebarSelectedElementIds, { immediate: true });
watch([fileId, session.currentTitle], syncDrawingTab, { immediate: true });

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
.drawing-page {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: 8px;
}

.drawing-page__canvas {
  display: flex;
  flex: 1;
  width: 0;
  min-width: 0;
  min-height: 0;
  padding: 8px 0;
}
</style>

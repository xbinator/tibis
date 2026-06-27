<!--
  @file index.vue
  @description 独立画图工具页面。
-->
<template>
  <main class="drawing-page" tabindex="0" @blur="session.actions.onBlur">
    <PanelSidebar
      :elements="session.data.value.elements"
      :selected-element-ids="selectedElementIds"
      @select-element="handleSidebarElementSelect"
      @copy-element="handleSidebarElementCopy"
      @delete-element="handleSidebarElementDelete"
      @move-element="handleSidebarElementMove"
    />

    <section ref="canvasRef" class="drawing-page__canvas">
      <BDrawing ref="drawingRef" v-model:value="session.data.value" v-model:select="selectedTarget" />
    </section>

    <PanelSettings v-model:select="selectedTarget" :drawing-data="session.data.value" />
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { cloneDeep } from 'lodash-es';
import type BDrawingComponent from '@/components/BDrawing/index.vue';
import type { DrawingData, DrawingElement, DrawingSelectTarget } from '@/components/BDrawing/types';
import { DRAWING_GROUP_METADATA_KEY } from '@/components/BDrawing/utils/drawingGroups';
import { useFileSession } from '@/hooks/useFileSession';
import { useTabsStore } from '@/stores/workspace/tabs';
import PanelSettings from './components/PanelSettings.vue';
import PanelSidebar from './components/PanelSidebar.vue';
import { useBindings } from './hooks/useBindings';
import { provideDragger, useDragger, type DraggerItem, type DraggerPoint } from './hooks/useDragger';
import { reorderDrawingLayerElementsByDisplayPosition, type DrawingLayerMovePosition } from './utils/layerOrder';

const route = useRoute();
const tabsStore = useTabsStore();
const fileId = ref(String(route.params.id || ''));
const isActive = ref(true);
const drawingRef = ref<InstanceType<typeof BDrawingComponent>>();
const canvasRef = ref<HTMLElement | null>(null);
const routePath = computed<string>(() => route.fullPath || `/drawing/${fileId.value}`);
/** 侧栏复制图层时使用的位置偏移。 */
const DRAWING_LAYER_COPY_OFFSET = 16;
/** 侧栏复制图层时使用的元素 ID 前缀。 */
const DRAWING_LAYER_COPY_ID_PREFIX = 'drawing-shape-';

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

/**
 * 判断当前设置目标是否为画图元素。
 * @param target - 当前设置目标
 * @returns 是否为画图元素
 */
function isDrawingElementTarget(target: DrawingSelectTarget): target is DrawingElement {
  return Boolean(target && typeof target === 'object' && 'id' in target);
}

/**
 * 读取自动生成 ID 中的序号。
 * @param id - 元素 ID
 * @returns 序号，不匹配时返回 null
 */
function getGeneratedElementIdIndex(id: string): number | null {
  if (!id.startsWith(DRAWING_LAYER_COPY_ID_PREFIX)) {
    return null;
  }

  const rawIndex = id.slice(DRAWING_LAYER_COPY_ID_PREFIX.length);
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
  let nextIndex = elements.reduce<number>((maxIndex: number, element: DrawingElement): number => {
    const index = getGeneratedElementIdIndex(element.id);

    return index === null ? maxIndex : Math.max(maxIndex, index);
  }, 0);
  let nextId = `${DRAWING_LAYER_COPY_ID_PREFIX}${nextIndex + 1}`;

  while (existingIds.has(nextId)) {
    nextIndex += 1;
    nextId = `${DRAWING_LAYER_COPY_ID_PREFIX}${nextIndex + 1}`;
  }

  return nextId;
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

/** 当前侧栏需要高亮的单选元素 ID。 */
const selectedElementIds = computed<string[]>((): string[] => (isDrawingElementTarget(selectedTarget.value) ? [selectedTarget.value.id] : []));

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
  drawingRef.value?.selectElementById(element.id);
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
  await nextTick();
  drawingRef.value?.selectElementById(copiedElement.id);
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

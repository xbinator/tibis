<!--
  @file index.vue
  @description 独立画图工具页面。
-->
<template>
  <main class="drawing-page" tabindex="0" @blur="session.actions.onBlur">
    <SidebarPanel :elements="session.data.value.elements" :selected-element-ids="selectedElementIds" />
    <section class="drawing-page__canvas" @dragover="handleCanvasDragOver" @drop="handleCanvasDrop">
      <BDrawing ref="drawingRef" v-model="session.data.value" @selection-change="handleDrawingSelectionChange" />
    </section>
    <SettingsPanel :drawing-data="session.data.value" :selected-elements="selectedElements" />
  </main>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type BDrawingComponent from '@/components/BDrawing/index.vue';
import type { DrawingData, DrawingElement } from '@/components/BDrawing/types';
import { useFileSession } from '@/hooks/useFileSession';
import { useTabsStore } from '@/stores/workspace/tabs';
import SettingsPanel from './components/SettingsPanel.vue';
import SidebarPanel from './components/SidebarPanel.vue';
import { useBindings } from './hooks/useBindings';
import { getDrawingElementDragData } from './utils/drag';

const route = useRoute();
const tabsStore = useTabsStore();
const fileId = ref(String(route.params.id || ''));
const isActive = ref(true);
const drawingRef = ref<InstanceType<typeof BDrawingComponent>>();
const selectedElementIds = ref<string[]>([]);
const routePath = computed<string>(() => route.fullPath || `/drawing/${fileId.value}`);

/**
 * 创建空画图数据。
 * @returns 空画图数据
 */
function createEmptyDrawingData(): DrawingData {
  return {
    elements: [],
    viewport: { center: { x: 0, y: 0 }, zoom: 1 }
  };
}

const session = useFileSession<DrawingData>({
  fileId,
  kind: 'tibis',
  defaultName: 'Untitled',
  defaultExt: 'tibis',
  defaultData: createEmptyDrawingData(),
  type: 'drawing',
  version: 1,
  routeName: 'drawing',
  fallbackRouteName: 'editor'
});
/** 当前用于右侧设置栏展示的选中元素列表。 */
const selectedElements = computed<DrawingElement[]>(() => {
  const selectedIdSet = new Set(selectedElementIds.value);

  return session.data.value.elements.filter((element: DrawingElement): boolean => selectedIdSet.has(element.id));
});

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

/**
 * 同步 BDrawing 内部选区到页面侧边栏。
 * @param selection - 当前选中元素 ID 列表
 */
function handleDrawingSelectionChange(selection: string[]): void {
  selectedElementIds.value = selection;
}

/**
 * 处理画布拖拽悬停。
 * @param event - 拖拽事件
 */
function handleCanvasDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

/**
 * 处理画布拖拽放置。
 * @param event - 拖拽事件
 */
function handleCanvasDrop(event: DragEvent): void {
  event.preventDefault();
  const dragData = getDrawingElementDragData(event.dataTransfer);
  if (!dragData) {
    return;
  }

  drawingRef.value?.createElementFromClientPoint(dragData.name, { x: event.clientX, y: event.clientY }).catch((error: unknown): void => {
    console.warn('BDrawing drop create failed', error);
  });
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

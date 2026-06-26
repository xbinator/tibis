<!--
  @file index.vue
  @description 独立画图工具页面。
-->
<template>
  <main class="drawing-page" tabindex="0" @blur="session.actions.onBlur">
    <SidebarPanel :elements="session.data.value.elements" />

    <section class="drawing-page__canvas" @dragover="handleCanvasDragOver" @drop="handleCanvasDrop">
      <BDrawing ref="drawingRef" v-model:value="session.data.value" v-model:select="selectedTarget" />
    </section>

    <SettingsPanel v-model:select="selectedTarget" :drawing-data="session.data.value" />
  </main>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type BDrawingComponent from '@/components/BDrawing/index.vue';
import type { DrawingData, DrawingSelectTarget } from '@/components/BDrawing/types';
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
const routePath = computed<string>(() => route.fullPath || `/drawing/${fileId.value}`);

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
  if (!dragData) return;

  drawingRef.value?.createElementFromClientPoint(dragData.name, { x: event.clientX, y: event.clientY });
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

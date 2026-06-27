<!--
  @file index.vue
  @description 独立画图工具页面。
-->
<template>
  <main class="drawing-page" tabindex="0" @blur="session.actions.onBlur">
    <PanelSidebar :elements="session.data.value.elements" :selected-element-ids="selectedElementIds" @select-element="handleSidebarElementSelect" />

    <section ref="canvasRef" class="drawing-page__canvas">
      <BDrawing ref="drawingRef" v-model:value="session.data.value" v-model:select="selectedTarget" />
    </section>

    <PanelSettings v-model:select="selectedTarget" :drawing-data="session.data.value" />
  </main>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type BDrawingComponent from '@/components/BDrawing/index.vue';
import type { DrawingData, DrawingElement, DrawingSelectTarget } from '@/components/BDrawing/types';
import { useFileSession } from '@/hooks/useFileSession';
import { useTabsStore } from '@/stores/workspace/tabs';
import PanelSettings from './components/PanelSettings.vue';
import PanelSidebar from './components/PanelSidebar.vue';
import { useBindings } from './hooks/useBindings';
import { provideDragger, useDragger, type DraggerItem, type DraggerPoint } from './hooks/useDragger';

const route = useRoute();
const tabsStore = useTabsStore();
const fileId = ref(String(route.params.id || ''));
const isActive = ref(true);
const drawingRef = ref<InstanceType<typeof BDrawingComponent>>();
const canvasRef = ref<HTMLElement | null>(null);
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
 * 判断当前设置目标是否为画图元素。
 * @param target - 当前设置目标
 * @returns 是否为画图元素
 */
function isDrawingElementTarget(target: DrawingSelectTarget): target is DrawingElement {
  return Boolean(target && typeof target === 'object' && 'id' in target);
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

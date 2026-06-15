<!--
  @file index.vue
  @description 独立画图工具页面。
-->
<template>
  <main class="drawing-page" tabindex="0" @blur="session.actions.onBlur">
    <BDrawing v-model="drawingData" />
  </main>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { DrawingData } from '@/components/BDrawing/types';
import { useFileSession } from '@/hooks/useFileSession';
import { useTabsStore } from '@/stores/workspace/tabs';
import { useBindings } from './hooks/useBindings';

const route = useRoute();
const tabsStore = useTabsStore();
const fileId = ref(String(route.params.id || ''));
const isActive = ref(true);
const routePath = computed<string>(() => route.fullPath || `/drawing/${fileId.value}`);

/**
 * 创建空画图数据。
 * @returns 空画图数据
 */
function createEmptyDrawingData(): DrawingData {
  return {
    elements: [],
    edges: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
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
const drawingData = session.data;
const { currentTitle } = session;

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
    title: currentTitle.value,
    cacheKey: `drawing:${fileId.value}`
  });
}

watch([fileId, currentTitle], syncDrawingTab, { immediate: true });

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
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>

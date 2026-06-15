<!--
  @file index.vue
  @description 独立画图工具页面。
-->
<template>
  <main class="drawing-page">
    <div class="beta-notice">
      <Icon icon="lucide:info" width="14" height="14" />
      <span>Beta 功能，数据暂不支持持久化保存，关闭页面后数据将丢失</span>
    </div>
    <BDrawing v-model="drawingData" />
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import BDrawing from '@/components/BDrawing/index.vue';
import type { DrawingData } from '@/components/BDrawing/types';

/** 当前独立画图页面的画板数据。 */
const drawingData = ref<DrawingData>({
  elements: [],
  edges: [],
  viewport: {
    center: { x: 0, y: 0 },
    zoom: 1
  }
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

.beta-notice {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  font-size: 12px;
  color: #f59e0b;
  background: rgb(245 158 11 / 8%);
}
</style>

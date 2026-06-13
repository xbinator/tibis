<!--
  @file index.vue
  @description 独立画图工具页面。
-->
<template>
  <main class="drawing-page">
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
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>

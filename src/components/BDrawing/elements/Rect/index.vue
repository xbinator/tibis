<!--
  @file index.vue
  @description BDrawing 矩形元素中间画布视图。
-->
<template>
  <div class="drawing-rect-element-view">{{ element?.title }}</div>
</template>

<script setup lang="ts">
import type { DrawingShapeElement } from '../../types';

/**
 * 矩形元素中间画布视图入参。
 */
interface Props {
  /** 当前矩形元素 */
  element?: DrawingShapeElement;
}

defineProps<Props>();
</script>

<style lang="less" scoped>
.drawing-rect-element-view {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}
</style>

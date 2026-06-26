<!--
  @file index.vue
  @description BDrawing 文本元素中间画布视图。
-->
<template>
  <div class="drawing-text-element-view">{{ element?.title }}</div>
</template>

<script setup lang="ts">
import type { DrawingShapeElement } from '../../types';

/**
 * 文本元素中间画布视图入参。
 */
interface Props {
  /** 当前文本元素 */
  element?: DrawingShapeElement;
}

defineProps<Props>();
</script>

<style lang="less" scoped>
.drawing-text-element-view {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 32px;
  padding: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
}
</style>

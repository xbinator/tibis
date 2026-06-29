<!--
  @file Setter.vue
  @description BDrawing 矩形元素专属属性设置面板。
-->
<template>
  <BSectionBlock data-testid="drawing-rect-setter" title="矩形属性">
    <div class="drawing-rect-setter__empty">暂无矩形专属属性</div>
  </BSectionBlock>
</template>

<script setup lang="ts">
import type { DrawingData, DrawingElement } from '../../types';

/**
 * 矩形元素 Setter 入参。
 */
interface Props {
  /** 当前画图数据，保留给统一 Setter 调度透传 */
  drawingData?: DrawingData;
}

defineProps<Props>();
/** 当前编辑的矩形元素。 */
defineModel<DrawingElement>('element', { required: true });
</script>

<style lang="less" scoped>
.drawing-rect-setter__empty {
  padding: 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}
</style>

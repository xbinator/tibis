<!--
  @file DrawingEdge.vue
  @description BDrawing SVG 连线渲染组件。
-->
<template>
  <g v-if="pathData" class="b-drawing-edge" data-testid="drawing-edge">
    <path class="b-drawing-edge__line" :d="pathData" marker-end="url(#b-drawing-arrow)" />
    <text v-if="edge.label" class="b-drawing-edge__label" :x="labelPosition.x" :y="labelPosition.y">{{ edge.label }}</text>
  </g>
</template>

<script setup lang="ts">
import type { DrawingEdge, DrawingElement, DrawingPoint } from '../types';
import { computed } from 'vue';
import { createDrawingLinePath, findDrawingElementCenter, getDrawingLineLabelPosition } from '../utils/drawingGeometry';

/**
 * 连线组件入参。
 */
interface Props {
  /** 连线 */
  edge: DrawingEdge;
  /** 元素列表 */
  elements: DrawingElement[];
}

const props = defineProps<Props>();

/**
 * 获取节点中心点。
 * @param nodeId - 节点 ID
 * @returns 中心点，找不到节点时返回 null
 */
function getNodeCenter(nodeId: string): DrawingPoint | null {
  return findDrawingElementCenter(props.elements, nodeId);
}

const source = computed<DrawingPoint | null>(() => getNodeCenter(props.edge.sourceId));
const target = computed<DrawingPoint | null>(() => getNodeCenter(props.edge.targetId));
const pathData = computed<string>(() => {
  if (!source.value || !target.value) {
    return '';
  }

  return createDrawingLinePath(source.value, target.value);
});
const labelPosition = computed<DrawingPoint>(() => {
  if (!source.value || !target.value) {
    return { x: 0, y: 0 };
  }

  return getDrawingLineLabelPosition(source.value, target.value);
});
</script>

<style lang="less" scoped>
.b-drawing-edge__line {
  fill: none;
  stroke: var(--text-tertiary);
  stroke-width: 2;
}

.b-drawing-edge__label {
  font-size: 12px;
  font-weight: 600;
  text-anchor: middle;
  fill: var(--text-secondary);
  stroke: var(--bg-primary);
  stroke-width: 4px;
  paint-order: stroke;
}
</style>

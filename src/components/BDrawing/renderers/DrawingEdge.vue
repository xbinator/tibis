<!--
  @file DrawingEdge.vue
  @description BDrawing SVG 连线渲染组件。
-->
<template>
  <g class="b-drawing-edge" data-testid="drawing-edge">
    <path class="b-drawing-edge__line" :d="pathData" marker-end="url(#b-drawing-arrow)" />
    <text v-if="edge.label" class="b-drawing-edge__label" :x="labelPosition.x" :y="labelPosition.y">{{ edge.label }}</text>
  </g>
</template>

<script setup lang="ts">
import type { DrawingEdge, DrawingElement, DrawingPoint } from '../types';
import { computed } from 'vue';

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
 * @returns 中心点
 */
function getNodeCenter(nodeId: string): DrawingPoint {
  const node = props.elements.find((item) => item.id === nodeId);
  if (!node) {
    return { x: 0, y: 0 };
  }

  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  };
}

const source = computed<DrawingPoint>(() => getNodeCenter(props.edge.sourceId));
const target = computed<DrawingPoint>(() => getNodeCenter(props.edge.targetId));
const pathData = computed<string>(() => `M ${source.value.x} ${source.value.y} L ${target.value.x} ${target.value.y}`);
const labelPosition = computed<DrawingPoint>(() => ({
  x: (source.value.x + target.value.x) / 2,
  y: (source.value.y + target.value.y) / 2 - 8
}));
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

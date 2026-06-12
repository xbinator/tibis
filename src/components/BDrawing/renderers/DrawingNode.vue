<!--
  @file DrawingNode.vue
  @description BDrawing SVG 节点渲染组件。
-->
<template>
  <g
    class="b-drawing-node b-drawing-element"
    :class="{ 'is-selected': selected }"
    data-testid="drawing-node"
    :data-drawing-element-id="node.id"
    :data-drawing-shape="node.shape"
    :transform="nodeTransform"
    @pointerdown.stop="emit('select', node.id, $event)"
  >
    <polygon v-if="isDiamondShape" class="b-drawing-node__shape" data-testid="drawing-shape-diamond" :points="diamondPoints" />
    <ellipse
      v-else-if="node.shape === 'ellipse'"
      class="b-drawing-node__shape"
      data-testid="drawing-shape-ellipse"
      :cx="node.size.width / 2"
      :cy="node.size.height / 2"
      :rx="node.size.width / 2"
      :ry="node.size.height / 2"
    />
    <rect
      v-else
      class="b-drawing-node__shape"
      data-testid="drawing-shape-rect"
      :width="node.size.width"
      :height="node.size.height"
      :rx="node.shape === 'text' ? 0 : 10"
    />
    <text class="b-drawing-node__text" :x="node.size.width / 2" :y="node.size.height / 2">{{ node.text }}</text>
  </g>
</template>

<script setup lang="ts">
import type { DrawingShapeElement } from '../types';
import { computed } from 'vue';
import { createDrawingDiamondPoints, createDrawingElementTransform, isDrawingDiamondShape } from '../utils/drawingGeometry';

/**
 * 节点组件入参。
 */
interface Props {
  /** 节点 */
  node: DrawingShapeElement;
  /** 是否选中 */
  selected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selected: false
});

const emit = defineEmits<{
  /** 选择节点 */
  select: [id: string, event: PointerEvent];
}>();

const isDiamondShape = computed<boolean>(() => isDrawingDiamondShape(props.node.shape));
const nodeTransform = computed<string>(() => createDrawingElementTransform(props.node.position, props.node.size, props.node.rotation));
const diamondPoints = computed<string>(() => createDrawingDiamondPoints(props.node.size));
</script>

<style lang="less" scoped>
.b-drawing-node {
  cursor: pointer;
}

.b-drawing-node__shape {
  fill: var(--bg-elevated);
  stroke: var(--border-hover);
  stroke-width: 1.5;
  transition: fill 0.15s ease, stroke 0.15s ease, filter 0.15s ease;
}

.b-drawing-node.is-selected .b-drawing-node__shape {
  stroke: var(--color-primary);
}

.b-drawing-node__text {
  font-size: 13px;
  font-weight: 650;
  dominant-baseline: middle;
  pointer-events: none;
  text-anchor: middle;
  fill: var(--text-primary);
}
</style>

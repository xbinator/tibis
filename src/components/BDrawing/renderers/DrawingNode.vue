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
    :opacity="node.style?.opacity"
    :transform="nodeTransform"
    @pointerdown.stop="emit('select', node.id, $event)"
    @pointerup="emit('release', node.id, $event)"
  >
    <polygon
      v-if="isDiamondShape"
      class="b-drawing-node__shape"
      data-testid="drawing-shape-diamond"
      :fill="node.style?.fill"
      :points="diamondPoints"
      :stroke="node.style?.stroke"
      :stroke-width="node.style?.strokeWidth"
      :style="shapeStyle"
    />
    <ellipse
      v-else-if="node.shape === 'ellipse'"
      class="b-drawing-node__shape"
      data-testid="drawing-shape-ellipse"
      :cx="node.size.width / 2"
      :cy="node.size.height / 2"
      :fill="node.style?.fill"
      :rx="node.size.width / 2"
      :ry="node.size.height / 2"
      :stroke="node.style?.stroke"
      :stroke-width="node.style?.strokeWidth"
      :style="shapeStyle"
    />
    <rect
      v-else
      class="b-drawing-node__shape"
      data-testid="drawing-shape-rect"
      :fill="node.style?.fill"
      :width="node.size.width"
      :height="node.size.height"
      :stroke="node.style?.stroke"
      :stroke-width="node.style?.strokeWidth"
      :style="shapeStyle"
    />
    <text class="b-drawing-node__text" :fill="node.style?.color" :style="textStyle" :x="node.size.width / 2" :y="node.size.height / 2">
      {{ node.text }}
    </text>
    <g v-if="showConnectorAnchors" class="b-drawing-node__anchors">
      <circle
        v-for="anchor in connectorAnchors"
        :key="anchor.id"
        class="b-drawing-node__anchor"
        data-testid="drawing-connector-anchor"
        :data-drawing-anchor="anchor.id"
        :cx="anchor.x"
        :cy="anchor.y"
        r="4"
      />
    </g>
  </g>
</template>

<script setup lang="ts">
import type { DrawingConnectorAnchor, DrawingShapeElement } from '../types';
import type { CSSProperties } from 'vue';
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
  /** 是否显示连接锚点 */
  showConnectorAnchors?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  showConnectorAnchors: false
});

const emit = defineEmits<{
  /** 选择节点 */
  select: [id: string, event: PointerEvent];
  /** 在节点上释放指针 */
  release: [id: string, event: PointerEvent];
}>();

const isDiamondShape = computed<boolean>(() => isDrawingDiamondShape(props.node.shape));
const nodeTransform = computed<string>(() => createDrawingElementTransform(props.node.position, props.node.size, props.node.rotation));
const diamondPoints = computed<string>(() => createDrawingDiamondPoints(props.node.size));
const shapeStyle = computed<CSSProperties>(() => ({
  fill: props.node.style?.fill,
  stroke: props.node.style?.stroke,
  strokeWidth: props.node.style?.strokeWidth === undefined ? undefined : String(props.node.style.strokeWidth)
}));
const textStyle = computed<CSSProperties>(() => ({
  fill: props.node.style?.color
}));
const connectorAnchors = computed<Array<{ id: Exclude<DrawingConnectorAnchor, 'center'>; x: number; y: number }>>(() => [
  { id: 'top', x: props.node.size.width / 2, y: 0 },
  { id: 'right', x: props.node.size.width, y: props.node.size.height / 2 },
  { id: 'bottom', x: props.node.size.width / 2, y: props.node.size.height },
  { id: 'left', x: 0, y: props.node.size.height / 2 }
]);
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

.b-drawing-node__anchor {
  pointer-events: none;
  fill: var(--bg-primary);
  stroke: var(--color-primary);
  stroke-width: 2;
}
</style>

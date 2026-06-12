<!--
  @file DrawingConnector.vue
  @description BDrawing SVG 连接线元素渲染组件。
-->
<template>
  <g v-if="pathData" class="b-drawing-connector" data-testid="drawing-connector">
    <path class="b-drawing-connector__line" data-testid="drawing-connector-path" :d="pathData" marker-end="url(#b-drawing-arrow)" />
    <text v-if="connector.label" class="b-drawing-connector__label" :x="labelPosition.x" :y="labelPosition.y">{{ connector.label }}</text>
  </g>
</template>

<script setup lang="ts">
import type { DrawingConnectorAnchor, DrawingConnectorElement, DrawingElement, DrawingPoint } from '../types';
import { computed } from 'vue';
import { createDrawingLinePath, findDrawingShapeElement, getDrawingConnectorAnchorPoint, getDrawingLineLabelPosition } from '../utils/drawingGeometry';

/**
 * 连接线组件入参。
 */
interface Props {
  /** 连接线元素 */
  connector: DrawingConnectorElement;
  /** 画板元素列表 */
  elements: DrawingElement[];
}

const props = defineProps<Props>();

/**
 * 读取形状锚点。
 * @param elementId - 元素 ID
 * @param anchor - 锚点
 * @returns 锚点坐标，找不到时返回 null
 */
function getElementAnchorPoint(elementId: string, anchor: DrawingConnectorAnchor): DrawingPoint | null {
  const element = findDrawingShapeElement(props.elements, elementId);

  return element ? getDrawingConnectorAnchorPoint(element, anchor) : null;
}

const source = computed<DrawingPoint | null>(() => getElementAnchorPoint(props.connector.source.elementId, props.connector.source.anchor));
const target = computed<DrawingPoint | null>(() => getElementAnchorPoint(props.connector.target.elementId, props.connector.target.anchor));
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
.b-drawing-connector__line {
  fill: none;
  stroke: var(--text-tertiary);
  stroke-width: 2;
}

.b-drawing-connector__label {
  font-size: 12px;
  font-weight: 600;
  text-anchor: middle;
  fill: var(--text-secondary);
  stroke: var(--bg-primary);
  stroke-width: 4px;
  paint-order: stroke;
}
</style>

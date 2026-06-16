<!--
  @file DrawingConnector.vue
  @description BDrawing SVG 连接线元素渲染组件。
-->
<template>
  <g
    v-if="shouldRender"
    class="b-drawing-connector"
    :class="{ 'b-drawing-element': showHit || showLine, 'is-selected': selected }"
    :data-drawing-element-id="connector.id"
    @dblclick.stop="emit('edit', connector.id, $event)"
    @pointerdown.stop="handlePointerdown"
  >
    <path v-if="showHit" class="b-drawing-connector__hit" :d="pathData" />
    <path v-if="showLine" class="b-drawing-connector__line" :d="pathData" :stroke="lineStroke" :stroke-width="lineStrokeWidth" />
    <g v-if="showMarkers" class="b-drawing-connector__markers">
      <path v-if="markerStartPath" class="b-drawing-connector__marker-arrow b-drawing-connector__marker-arrow--start" :d="markerStartPath" :fill="lineStroke" />
      <path v-if="markerEndPath" class="b-drawing-connector__marker-arrow b-drawing-connector__marker-arrow--end" :d="markerEndPath" :fill="lineStroke" />
    </g>
    <g v-if="endpointPositions" class="b-drawing-connector__endpoints">
      <circle class="b-drawing-connector__endpoint" :cx="endpointPositions.source.x" :cy="endpointPositions.source.y" r="4.5" />
      <circle class="b-drawing-connector__endpoint" :cx="endpointPositions.target.x" :cy="endpointPositions.target.y" r="4.5" />
    </g>
    <text v-if="showLine && connector.label && !editing" class="b-drawing-connector__label" :style="labelStyle" :x="labelPosition.x" :y="labelPosition.y">
      {{ connector.label }}
    </text>
  </g>
</template>

<script setup lang="ts">
import type { DrawingConnectorAnchor, DrawingConnectorElement, DrawingElement, DrawingPoint } from '../types';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';
import { DRAWING_CONNECTOR_LABEL_DEFAULT_FONT_SIZE, DRAWING_CONNECTOR_LABEL_DEFAULT_FONT_WEIGHT } from '../constants/text';
import {
  createDrawingConnectorMarkerPath,
  createDrawingConnectorPath,
  findDrawingShapeElement,
  getDrawingConnectorAnchorPoint,
  getDrawingConnectorLabelPosition
} from '../utils/drawingGeometry';

/**
 * 连接线组件入参。
 */
interface Props {
  /** 连接线元素 */
  connector: DrawingConnectorElement;
  /** 画板元素列表 */
  elements: DrawingElement[];
  /** 是否选中 */
  selected?: boolean;
  /** 是否渲染连接线主体 */
  showLine?: boolean;
  /** 是否渲染透明命中热区 */
  showHit?: boolean;
  /** 是否渲染连接线端点标记 */
  showMarkers?: boolean;
  /** 是否渲染选中端点 */
  showSelectedEndpoints?: boolean;
  /** 是否处于标签编辑态 */
  editing?: boolean;
}

/**
 * 连接线端点坐标。
 */
interface ConnectorEndpointPositions {
  /** 起点坐标 */
  source: DrawingPoint;
  /** 终点坐标 */
  target: DrawingPoint;
}

const props = withDefaults(defineProps<Props>(), {
  editing: false,
  selected: false,
  showHit: true,
  showLine: true,
  showMarkers: true,
  showSelectedEndpoints: true
});
const emit = defineEmits<{
  /** 编辑连接线 */
  edit: [id: string, event: MouseEvent];
  /** 选择连接线 */
  select: [id: string, event: PointerEvent];
}>();

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
const pathData = computed<string>(() => createDrawingConnectorPath(props.elements, props.connector));
const lineStroke = computed<string>(() => props.connector.style?.stroke ?? '#64748b');
const lineStrokeWidth = computed<number>(() => props.connector.style?.strokeWidth ?? 2);
const markerStartPath = computed<string>(() => createDrawingConnectorMarkerPath(props.elements, props.connector, 'start'));
const markerEndPath = computed<string>(() => createDrawingConnectorMarkerPath(props.elements, props.connector, 'end'));
const endpointPositions = computed<ConnectorEndpointPositions | null>(() => {
  if (!props.selected || !props.showSelectedEndpoints || !source.value || !target.value) {
    return null;
  }

  return {
    source: source.value,
    target: target.value
  };
});
const shouldRender = computed<boolean>(
  () =>
    Boolean(pathData.value) &&
    (props.showLine ||
      props.showHit ||
      endpointPositions.value !== null ||
      (props.showMarkers && (Boolean(markerStartPath.value) || Boolean(markerEndPath.value))))
);
const labelPosition = computed<DrawingPoint>(() => {
  return getDrawingConnectorLabelPosition(props.elements, props.connector);
});
/** 连线标签样式。 */
const labelStyle = computed<CSSProperties>(() => ({
  fontSize: `${props.connector.style?.fontSize ?? DRAWING_CONNECTOR_LABEL_DEFAULT_FONT_SIZE}px`,
  fontWeight: String(props.connector.style?.fontWeight ?? DRAWING_CONNECTOR_LABEL_DEFAULT_FONT_WEIGHT)
}));

/**
 * 处理连接线指针按下。
 * @param event - 指针事件
 */
function handlePointerdown(event: PointerEvent): void {
  if (!props.showHit && !props.showLine) {
    return;
  }

  emit('select', props.connector.id, event);
}
</script>

<style lang="less" scoped>
.b-drawing-connector__line {
  fill: none;
  stroke-linecap: round;
  transition: stroke 0.15s ease, stroke-dasharray 0.15s ease, opacity 0.15s ease;
}

.b-drawing-connector__hit {
  pointer-events: stroke;
  cursor: pointer;
  fill: none;
  stroke: transparent;
  stroke-width: 14;
}

.b-drawing-connector.is-selected .b-drawing-connector__line {
  opacity: 0.92;
  stroke-dasharray: 5 4;
}

.b-drawing-connector__markers {
  pointer-events: none;
}

.b-drawing-connector__marker-arrow {
  transition: fill 0.15s ease;
}

.b-drawing-connector__endpoints {
  pointer-events: none;
}

.b-drawing-connector__endpoint {
  fill: var(--bg-primary);
  stroke: var(--color-primary);
  stroke-width: 2;
}

.b-drawing-connector__label {
  font-size: 12px;
  font-weight: 400;
  text-anchor: middle;
  fill: var(--text-secondary);
  stroke: var(--bg-primary);
  stroke-width: 4px;
  paint-order: stroke;
}
</style>

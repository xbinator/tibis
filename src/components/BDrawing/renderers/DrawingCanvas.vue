<!--
  @file DrawingCanvas.vue
  @description BDrawing SVG 画布组件。
-->
<template>
  <div
    class="b-drawing-canvas"
    :class="`is-tool-${activeTool}`"
    data-testid="drawing-canvas"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
  >
    <svg class="b-drawing-canvas__svg" :viewBox="viewBox">
      <defs>
        <marker id="b-drawing-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path class="b-drawing-canvas__arrow-head" d="M0,0 L0,6 L9,3 z"></path>
        </marker>
      </defs>

      <DrawingEdgeRenderer v-for="edge in edges" :key="edge.id" :edge="edge" :elements="elements" />
      <DrawingConnectorRenderer v-for="connector in connectorElements" :key="connector.id" :connector="connector" :elements="elements" />
      <DrawingNodeRenderer
        v-for="element in shapeElements"
        :key="element.id"
        :node="element"
        :selected="selection.includes(element.id)"
        @select="handleElementSelect"
      />
      <DrawingCreatePreview v-if="draft?.kind === 'creating-shape'" :draft="draft" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type {
  DrawingConnectorElement,
  DrawingEdge,
  DrawingElement,
  DrawingInteractionDraft,
  DrawingPoint,
  DrawingShapeElement,
  DrawingToolMode,
  DrawingViewport
} from '../types';
import { computed } from 'vue';
import DrawingConnectorRenderer from './DrawingConnector.vue';
import DrawingCreatePreview from './DrawingCreatePreview.vue';
import DrawingEdgeRenderer from './DrawingEdge.vue';
import DrawingNodeRenderer from './DrawingNode.vue';

/**
 * 画布组件入参。
 */
interface Props {
  /** 元素列表 */
  elements: DrawingElement[];
  /** 连线列表 */
  edges: DrawingEdge[];
  /** 选区 */
  selection: string[];
  /** 视口 */
  viewport: DrawingViewport;
  /** 当前工具模式 */
  activeTool: DrawingToolMode;
  /** 当前交互草稿 */
  draft?: DrawingInteractionDraft;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 选择元素 */
  select: [id: string, event: PointerEvent];
  /** 画布按下 */
  'canvas-pointerdown': [point: DrawingPoint];
  /** 画布指针移动 */
  'canvas-pointermove': [point: DrawingPoint];
  /** 画布指针抬起 */
  'canvas-pointerup': [point: DrawingPoint];
}>();

const viewBox = computed<string>(() => {
  const width = 1200 / props.viewport.zoom;
  const height = 720 / props.viewport.zoom;

  return `${props.viewport.center.x - width / 2} ${props.viewport.center.y - height / 2} ${width} ${height}`;
});

const shapeElements = computed<DrawingShapeElement[]>(() => props.elements.filter((element): element is DrawingShapeElement => element.kind === 'shape'));
const connectorElements = computed<DrawingConnectorElement[]>(() =>
  props.elements.filter((element): element is DrawingConnectorElement => element.kind === 'connector')
);

/**
 * 转发元素按下选择事件。
 * @param id - 元素 ID
 * @param event - 指针事件
 */
function handleElementSelect(id: string, event: PointerEvent): void {
  emit('select', id, event);
}

/**
 * 获取当前 SVG 视口尺寸。
 * @returns SVG 视口尺寸
 */
function getViewBoxSize(): { width: number; height: number } {
  return {
    width: 1200 / props.viewport.zoom,
    height: 720 / props.viewport.zoom
  };
}

/**
 * 将浏览器指针位置转换为画板坐标。
 * @param event - 指针事件
 * @returns 画板坐标
 */
function getBoardPoint(event: PointerEvent): DrawingPoint {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { ...props.viewport.center };
  }

  const viewBoxSize = getViewBoxSize();
  const xRatio = (event.clientX - rect.left) / rect.width;
  const yRatio = (event.clientY - rect.top) / rect.height;

  return {
    x: props.viewport.center.x - viewBoxSize.width / 2 + xRatio * viewBoxSize.width,
    y: props.viewport.center.y - viewBoxSize.height / 2 + yRatio * viewBoxSize.height
  };
}

/**
 * 处理画布空白区域点击。
 * @param event - 指针事件
 */
function handlePointerDown(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  if (typeof target.setPointerCapture === 'function') {
    target.setPointerCapture(event.pointerId);
  }

  emit('canvas-pointerdown', getBoardPoint(event));
}

/**
 * 处理画布空白区域移动。
 * @param event - 指针事件
 */
function handlePointerMove(event: PointerEvent): void {
  emit('canvas-pointermove', getBoardPoint(event));
}

/**
 * 处理画布空白区域抬起。
 * @param event - 指针事件
 */
function handlePointerUp(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  if (typeof target.releasePointerCapture === 'function') {
    target.releasePointerCapture(event.pointerId);
  }

  emit('canvas-pointerup', getBoardPoint(event));
}
</script>

<style lang="less" scoped>
.b-drawing-canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.b-drawing-canvas.is-tool-select {
  cursor: default;
}

.b-drawing-canvas.is-tool-hand {
  cursor: grab;
}

.b-drawing-canvas.is-tool-process {
  cursor: crosshair;
}

.b-drawing-canvas.is-tool-rect,
.b-drawing-canvas.is-tool-ellipse,
.b-drawing-canvas.is-tool-diamond,
.b-drawing-canvas.is-tool-text {
  cursor: crosshair;
}

.b-drawing-canvas__svg {
  display: block;
  width: 100%;
  height: 100%;
}

.b-drawing-canvas__arrow-head {
  fill: var(--text-tertiary);
}
</style>

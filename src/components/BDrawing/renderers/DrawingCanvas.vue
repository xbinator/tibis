<!--
  @file DrawingCanvas.vue
  @description BDrawing SVG 画布组件。
-->
<template>
  <div class="b-drawing-canvas" :class="`is-tool-${activeTool}`" data-testid="drawing-canvas" @pointerdown="handlePointerDown">
    <svg class="b-drawing-canvas__svg" :viewBox="viewBox">
      <defs>
        <marker id="b-drawing-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path class="b-drawing-canvas__arrow-head" d="M0,0 L0,6 L9,3 z"></path>
        </marker>
      </defs>

      <DrawingEdgeRenderer v-for="edge in edges" :key="edge.id" :edge="edge" :nodes="nodes" />
      <DrawingNodeRenderer v-for="node in nodes" :key="node.id" :node="node" :selected="selection.includes(node.id)" @select="emit('select', $event)" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { DrawingEdge, DrawingNode, DrawingPoint, DrawingToolMode, DrawingViewport } from '../types';
import { computed } from 'vue';
import DrawingEdgeRenderer from './DrawingEdge.vue';
import DrawingNodeRenderer from './DrawingNode.vue';

/**
 * 画布组件入参。
 */
interface Props {
  /** 节点列表 */
  nodes: DrawingNode[];
  /** 连线列表 */
  edges: DrawingEdge[];
  /** 选区 */
  selection: string[];
  /** 视口 */
  viewport: DrawingViewport;
  /** 当前工具模式 */
  activeTool: DrawingToolMode;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 选择元素 */
  select: [id: string];
  /** 画布按下 */
  'canvas-pointerdown': [point: DrawingPoint];
}>();

const viewBox = computed<string>(() => {
  const width = 1200 / props.viewport.zoom;
  const height = 720 / props.viewport.zoom;

  return `${props.viewport.center.x - width / 2} ${props.viewport.center.y - height / 2} ${width} ${height}`;
});
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
  emit('canvas-pointerdown', getBoardPoint(event));
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

.b-drawing-canvas__svg {
  display: block;
  width: 100%;
  height: 100%;
}

.b-drawing-canvas__arrow-head {
  fill: var(--text-tertiary);
}

.b-drawing-canvas__empty {
  position: absolute;
  top: 50%;
  left: 50%;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-tertiary);
  pointer-events: none;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
  transform: translate(-50%, -50%);
}
</style>

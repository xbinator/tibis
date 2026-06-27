<!--
  @file DrawingCanvas.vue
  @description BDrawing HTML 画布组件。
-->
<template>
  <div
    ref="canvasRef"
    class="b-drawing-canvas"
    :class="[`is-tool-${activeTool}`, { 'is-create-tool': isCreateTool, 'is-panning': isPanning }]"
    :style="canvasStyle"
    data-testid="drawing-canvas"
    @contextmenu.prevent="handleCanvasContextMenu"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @wheel="handleWheel"
  >
    <div class="b-drawing-canvas__stage" :class="{ 'is-measuring': !viewportReady }" :style="stageStyle">
      <DrawingNodeRenderer
        v-for="element in shapeElements"
        :key="element.id"
        :node="element"
        :preview-position="getElementPreviewPosition(element.id)"
        :preview-size="getElementPreviewSize(element.id)"
        :selected="selection.includes(element.id)"
        @context-menu="handleElementContextMenu"
        @select="handleElementSelect"
        @release="handleElementRelease"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  DrawingContextMenuPayload,
  DrawingElement,
  DrawingGeometryChange,
  DrawingPoint,
  DrawingShapeElement,
  DrawingSize,
  DrawingViewport
} from '../types';
import type { CSSProperties } from 'vue';
import { computed, ref } from 'vue';
import { projectClientPointToDrawingBoard } from '../utils/drawingGeometry';
import DrawingNodeRenderer from './DrawingNode.vue';

/**
 * 画布组件入参。
 */
interface Props {
  /** 元素列表 */
  elements: DrawingElement[];
  /** 选区 */
  selection: string[];
  /** Moveable 操作中的预览几何 */
  geometryPreviewChanges?: DrawingGeometryChange[];
  /** 视口 */
  viewport: DrawingViewport;
  /** 视口渲染尺寸 */
  viewportSize: DrawingSize;
  /** 视口尺寸是否已经完成首次稳定 */
  viewportReady: boolean;
  /** 当前工具模式 */
  activeTool: string;
  /** 是否为元素创建工具 */
  isCreateTool?: boolean;
  /** 元素创建工具光标 */
  createCursor?: string;
  /** 是否正在平移（手型工具拖拽中） */
  isPanning?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 选择元素 */
  select: [id: string, event: PointerEvent];
  /** 在元素上释放指针 */
  'element-pointerup': [id: string, event: PointerEvent];
  /** 画布按下 */
  'canvas-pointerdown': [point: DrawingPoint, event: PointerEvent];
  /** 画布指针移动 */
  'canvas-pointermove': [point: DrawingPoint, event: PointerEvent];
  /** 画布指针抬起 */
  'canvas-pointerup': [point: DrawingPoint, event: PointerEvent];
  /** 画布滚轮 */
  'canvas-wheel': [event: WheelEvent];
  /** 打开右键菜单 */
  'context-menu': [payload: DrawingContextMenuPayload];
}>();

/** 画布根节点，用于统一坐标投影基准。 */
const canvasRef = ref<HTMLElement | null>(null);
/** Moveable 几何预览索引。 */
const geometryPreviewById = computed<Map<string, DrawingGeometryChange>>(
  () => new Map((props.geometryPreviewChanges ?? []).map((change: DrawingGeometryChange): [string, DrawingGeometryChange] => [change.id, change]))
);
/** 画布根节点内联样式。 */
const canvasStyle = computed<CSSProperties>(() => ({
  cursor: props.createCursor
}));
/** 承载画板世界坐标的 HTML 舞台样式。 */
const stageStyle = computed<CSSProperties>(() => {
  const viewportOffsetX = props.viewportSize.width / 2;
  const viewportOffsetY = props.viewportSize.height / 2;
  const boardOffsetX = -props.viewport.center.x;
  const boardOffsetY = -props.viewport.center.y;

  return {
    transform: `translate(${viewportOffsetX}px, ${viewportOffsetY}px) scale(${props.viewport.zoom}) translate(${boardOffsetX}px, ${boardOffsetY}px)`
  };
});

const shapeElements = computed<DrawingShapeElement[]>(() => props.elements);

/**
 * 读取元素预览位置。
 * @param id - 元素 ID
 * @returns 预览位置
 */
function getElementPreviewPosition(id: string): DrawingPoint | null {
  return geometryPreviewById.value.get(id)?.position ?? null;
}

/**
 * 读取元素预览尺寸。
 * @param id - 元素 ID
 * @returns 预览尺寸
 */
function getElementPreviewSize(id: string): DrawingSize | null {
  return geometryPreviewById.value.get(id)?.size ?? null;
}

/**
 * 转发元素按下选择事件。
 * @param id - 元素 ID
 * @param event - 指针事件
 */
function handleElementSelect(id: string, event: PointerEvent): void {
  emit('select', id, event);
}

/**
 * 转发元素释放事件。
 * @param id - 元素 ID
 * @param event - 指针事件
 */
function handleElementRelease(id: string, event: PointerEvent): void {
  emit('element-pointerup', id, event);
}

/**
 * 将浏览器指针位置转换为画板坐标。
 * @param event - 指针事件
 * @returns 画板坐标
 */
function getBoardPointFromClient(event: PointerEvent | MouseEvent): DrawingPoint {
  const target = canvasRef.value ?? (event.currentTarget as HTMLElement);
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { ...props.viewport.center };
  }

  const projection = projectClientPointToDrawingBoard({ x: event.clientX, y: event.clientY }, rect, props.viewport);

  return projection?.boardPoint ?? { ...props.viewport.center };
}

/**
 * 创建右键菜单事件载荷。
 * @param elementId - 命中的元素 ID
 * @param event - 鼠标事件
 * @returns 右键菜单事件载荷
 */
function createContextMenuPayload(elementId: string | null, event: MouseEvent): DrawingContextMenuPayload {
  return {
    elementId,
    clientPoint: { x: event.clientX, y: event.clientY },
    boardPoint: getBoardPointFromClient(event)
  };
}

/**
 * 处理节点右键菜单。
 * @param id - 元素 ID
 * @param event - 鼠标事件
 */
function handleElementContextMenu(id: string, event: MouseEvent): void {
  emit('context-menu', createContextMenuPayload(id, event));
}

/**
 * 处理画布空白区域右键菜单。
 * @param event - 鼠标事件
 */
function handleCanvasContextMenu(event: MouseEvent): void {
  emit('context-menu', createContextMenuPayload(null, event));
}

/**
 * 处理画布空白区域点击。
 * @param event - 指针事件
 */
function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  const target = event.currentTarget as HTMLElement;
  if (typeof target.setPointerCapture === 'function') {
    target.setPointerCapture(event.pointerId);
  }

  emit('canvas-pointerdown', getBoardPointFromClient(event), event);
}

/**
 * 处理画布空白区域移动。
 * @param event - 指针事件
 */
function handlePointerMove(event: PointerEvent): void {
  emit('canvas-pointermove', getBoardPointFromClient(event), event);
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

  emit('canvas-pointerup', getBoardPointFromClient(event), event);
}

/**
 * 转发画布滚轮事件。
 * @param event - 滚轮事件
 */
function handleWheel(event: WheelEvent): void {
  emit('canvas-wheel', event);
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

.b-drawing-canvas.is-tool-hand.is-panning {
  cursor: grabbing;
}

.b-drawing-canvas.is-tool-hand .b-drawing-element {
  pointer-events: none;
}

/* 元素创建工具激活时，禁止已有节点拦截指针事件，让点击穿透到画布以创建新元素 */
.b-drawing-canvas.is-create-tool .b-drawing-element {
  pointer-events: none;
}

.b-drawing-canvas__stage {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
}

.b-drawing-canvas__stage.is-measuring {
  opacity: 0;
}
</style>

<!--
  @file WidgetCanvas.vue
  @description BWidget HTML Widget组件。
-->
<template>
  <div
    ref="canvasRef"
    class="b-widget-canvas"
    :class="[`is-tool-${activeTool}`, { 'is-create-tool': isCreateTool, 'is-panning': isPanning }]"
    :style="canvasStyle"
    @contextmenu.prevent="handleCanvasContextMenu"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @wheel="handleWheel"
  >
    <div class="b-widget-canvas__stage" :class="{ 'is-measuring': !viewportReady }" :style="stageStyle">
      <WidgetNodeRenderer
        v-for="element in shapeElements"
        :key="element.id"
        :node="element"
        :preview-position="getElementPreviewPosition(element.id)"
        :preview-size="getElementPreviewSize(element.id)"
        :selected="isElementSelected(element.id)"
        @context-menu="handleElementContextMenu"
        @select="handleElementSelect"
        @release="handleElementRelease"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WidgetContextMenuPayload, WidgetElement, WidgetGeometryChange, WidgetPoint, WidgetShapeElement, WidgetSize, WidgetViewport } from '../types';
import type { CSSProperties } from 'vue';
import { computed, ref } from 'vue';
import { projectClientPointToWidgetBoard } from '../utils/widgetGeometry';
import { flattenWidgetElementTree, type WidgetRenderTreeNode } from '../utils/widgetTree';
import WidgetNodeRenderer from './WidgetNode.vue';

/**
 * Widget组件入参。
 */
interface Props {
  /** 元素列表 */
  elements: WidgetElement[];
  /** 选区 */
  selection: string[];
  /** 组合选区内当前编辑的子元素 ID */
  activeElementId?: string | null;
  /** Moveable 操作中的预览几何 */
  geometryPreviewChanges?: WidgetGeometryChange[];
  /** 视口 */
  viewport: WidgetViewport;
  /** 视口渲染尺寸 */
  viewportSize: WidgetSize;
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
  /** Widget按下 */
  'canvas-pointerdown': [point: WidgetPoint, event: PointerEvent];
  /** Widget指针移动 */
  'canvas-pointermove': [point: WidgetPoint, event: PointerEvent];
  /** Widget指针抬起 */
  'canvas-pointerup': [point: WidgetPoint, event: PointerEvent];
  /** Widget滚轮 */
  'canvas-wheel': [event: WheelEvent];
  /** 打开右键菜单 */
  'context-menu': [payload: WidgetContextMenuPayload];
}>();

/** Widget根节点，用于统一坐标投影基准。 */
const canvasRef = ref<HTMLElement | null>(null);
/** Moveable 几何预览索引。 */
const geometryPreviewById = computed<Map<string, WidgetGeometryChange>>(
  () => new Map((props.geometryPreviewChanges ?? []).map((change: WidgetGeometryChange): [string, WidgetGeometryChange] => [change.id, change]))
);
/** Widget根节点内联样式。 */
const canvasStyle = computed<CSSProperties>(() => ({
  cursor: props.createCursor
}));
/** 承载Widget世界坐标的 HTML 舞台样式。 */
const stageStyle = computed<CSSProperties>(() => {
  const viewportOffsetX = props.viewportSize.width / 2;
  const viewportOffsetY = props.viewportSize.height / 2;
  const boardOffsetX = -props.viewport.center.x;
  const boardOffsetY = -props.viewport.center.y;

  return {
    transform: `translate(${viewportOffsetX}px, ${viewportOffsetY}px) scale(${props.viewport.zoom}) translate(${boardOffsetX}px, ${boardOffsetY}px)`
  };
});

/** 按树结构展开后的可渲染元素，position 已转换为画布绝对坐标。 */
const shapeElements = computed<WidgetShapeElement[]>(() =>
  flattenWidgetElementTree(props.elements).map(
    (item: WidgetRenderTreeNode): WidgetShapeElement => ({
      ...item.element,
      position: item.absolutePosition
    })
  )
);

/**
 * 读取元素预览位置。
 * @param id - 元素 ID
 * @returns 预览位置
 */
function getElementPreviewPosition(id: string): WidgetPoint | null {
  return geometryPreviewById.value.get(id)?.position ?? null;
}

/**
 * 读取元素预览尺寸。
 * @param id - 元素 ID
 * @returns 预览尺寸
 */
function getElementPreviewSize(id: string): WidgetSize | null {
  return geometryPreviewById.value.get(id)?.size ?? null;
}

/**
 * 判断元素节点是否需要显示自身选中态。
 * @param id - 元素 ID
 * @returns 是否显示节点选中态
 */
function isElementSelected(id: string): boolean {
  if (props.activeElementId) {
    return props.activeElementId === id;
  }

  return props.selection.includes(id);
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
 * 将浏览器指针位置转换为Widget坐标。
 * @param event - 指针事件
 * @returns Widget坐标
 */
function getBoardPointFromClient(event: PointerEvent | MouseEvent): WidgetPoint {
  const target = canvasRef.value ?? (event.currentTarget as HTMLElement);
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { ...props.viewport.center };
  }

  const projection = projectClientPointToWidgetBoard({ x: event.clientX, y: event.clientY }, rect, props.viewport);

  return projection?.boardPoint ?? { ...props.viewport.center };
}

/**
 * 创建右键菜单事件载荷。
 * @param elementId - 命中的元素 ID
 * @param event - 鼠标事件
 * @returns 右键菜单事件载荷
 */
function createContextMenuPayload(elementId: string | null, event: MouseEvent): WidgetContextMenuPayload {
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
 * 处理Widget空白区域右键菜单。
 * @param event - 鼠标事件
 */
function handleCanvasContextMenu(event: MouseEvent): void {
  emit('context-menu', createContextMenuPayload(null, event));
}

/**
 * 处理Widget空白区域点击。
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
 * 处理Widget空白区域移动。
 * @param event - 指针事件
 */
function handlePointerMove(event: PointerEvent): void {
  emit('canvas-pointermove', getBoardPointFromClient(event), event);
}

/**
 * 处理Widget空白区域抬起。
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
 * 转发Widget滚轮事件。
 * @param event - 滚轮事件
 */
function handleWheel(event: WheelEvent): void {
  emit('canvas-wheel', event);
}
</script>

<style lang="less" scoped>
.b-widget-canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
}

.b-widget-canvas.is-tool-select {
  cursor: default;
}

.b-widget-canvas.is-tool-hand {
  cursor: grab;
}

.b-widget-canvas.is-tool-hand.is-panning {
  cursor: grabbing;
}

.b-widget-canvas.is-tool-hand .b-widget-element {
  pointer-events: none;
}

/* 元素创建工具激活时，禁止已有节点拦截指针事件，让点击穿透到Widget以创建新元素 */
.b-widget-canvas.is-create-tool .b-widget-element {
  pointer-events: none;
}

.b-widget-canvas__stage {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
}

.b-widget-canvas__stage.is-measuring {
  opacity: 0;
}
</style>

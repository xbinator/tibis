<!--
  @file DrawingCanvas.vue
  @description BDrawing SVG 画布组件。
-->
<template>
  <div
    class="b-drawing-canvas"
    :class="[`is-tool-${activeTool}`, { 'is-panning': isPanning }]"
    :style="canvasStyle"
    data-testid="drawing-canvas"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @wheel="handleWheel"
  >
    <svg class="b-drawing-canvas__svg" :class="{ 'is-measuring': !viewportReady }" :viewBox="viewBox">
      <defs>
        <marker id="b-drawing-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path class="b-drawing-canvas__arrow-head" d="M0,0 L0,6 L9,3 z"></path>
        </marker>
      </defs>

      <DrawingEdgeRenderer v-for="edge in edges" :key="edge.id" :edge="edge" :elements="elements" />
      <DrawingConnectorRenderer
        v-for="connector in connectorElements"
        :key="`connector-hit-${connector.id}`"
        :connector="connector"
        :elements="elements"
        :selected="selection.includes(connector.id)"
        :editing="editingElementId === connector.id"
        :show-line="false"
        :show-markers="false"
        :show-selected-endpoints="false"
        @edit="handleElementEdit"
        @select="handleElementSelect"
      />
      <DrawingNodeRenderer
        v-for="element in shapeElements"
        :key="element.id"
        :node="element"
        :active-connector-anchor="connectorHoverEndpoint?.elementId === element.id ? connectorHoverEndpoint.anchor : null"
        :editing="editingElementId === element.id"
        :preview-position="getElementPreviewPosition(element.id)"
        :preview-size="getElementPreviewSize(element.id)"
        :selected="selection.includes(element.id)"
        :show-connector-anchors="activeTool === 'connector'"
        @edit="handleElementEdit"
        @select="handleElementSelect"
        @release="handleElementRelease"
      />
      <path
        v-if="connectorPreviewPath"
        class="b-drawing-canvas__connector-preview"
        :d="connectorPreviewPath"
        :marker-end="connectorPreviewMarkerEnd"
        :stroke="connectorPreviewStroke"
        :stroke-width="connectorPreviewStrokeWidth"
      ></path>
      <DrawingConnectorRenderer
        v-for="connector in connectorElements"
        :key="connector.id"
        :connector="connector"
        :elements="elements"
        :editing="editingElementId === connector.id"
        :show-hit="false"
        :show-line="true"
        :show-selected-endpoints="false"
        @edit="handleElementEdit"
        @select="handleElementSelect"
      />
      <DrawingConnectorRenderer
        v-for="connector in selectedConnectorElements"
        :key="`selected-endpoints-${connector.id}`"
        :connector="connector"
        :elements="elements"
        :selected="true"
        :show-hit="false"
        :show-line="false"
        :show-markers="false"
      />
      <DrawingCreatePreview v-if="shapeDraft" :draft="shapeDraft" :draft-style="draftStyle" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type {
  DrawingConnectorElement,
  DrawingConnectorDraftOptions,
  DrawingConnectorEndpoint,
  DrawingEdge,
  DrawingElement,
  DrawingElementStyle,
  DrawingGeometryChange,
  DrawingInteractionDraft,
  DrawingPoint,
  DrawingShapeElement,
  DrawingSize,
  DrawingToolMode,
  DrawingViewport
} from '../types';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';
import {
  createDrawingLinePath,
  createDrawingViewBox,
  findDrawingShapeElement,
  getDrawingConnectorAnchorPoint,
  isDrawingConnectorElement,
  isDrawingShapeElement,
  projectClientPointToDrawingBoard
} from '../utils/drawingGeometry';
import DrawingConnectorRenderer from './DrawingConnector.vue';
import DrawingCreatePreview from './DrawingCreatePreview.vue';
import DrawingEdgeRenderer from './DrawingEdge.vue';
import DrawingNodeRenderer from './DrawingNode.vue';

/**
 * 创建形状草稿。
 */
type DrawingCreateShapeDraft = Extract<DrawingInteractionDraft, { kind: 'creating-shape' }>;
/**
 * 创建连接线草稿。
 */
type DrawingCreateConnectorDraft = Extract<DrawingInteractionDraft, { kind: 'creating-connector' }>;

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
  /** 正在编辑的元素 ID */
  editingElementId?: string | null;
  /** 正在编辑的形状预览尺寸 */
  editingPreviewSize?: DrawingSize | null;
  /** Moveable 操作中的预览几何 */
  geometryPreviewChanges?: DrawingGeometryChange[];
  /** 视口 */
  viewport: DrawingViewport;
  /** 视口渲染尺寸 */
  viewportSize: DrawingSize;
  /** 视口尺寸是否已经完成首次稳定 */
  viewportReady: boolean;
  /** 当前工具模式 */
  activeTool: DrawingToolMode;
  /** 当前交互草稿 */
  draft?: DrawingInteractionDraft;
  /** 创建草稿预览样式 */
  draftStyle?: DrawingElementStyle;
  /** 创建连接线草稿配置 */
  draftConnector?: DrawingConnectorDraftOptions;
  /** 创建连接线时 hover 的目标端点 */
  connectorHoverEndpoint?: DrawingConnectorEndpoint | null;
  /** 是否正在平移（手型工具拖拽中） */
  isPanning?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 编辑元素 */
  edit: [id: string, event: MouseEvent];
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
}>();

const viewBox = computed<string>(() => createDrawingViewBox(props.viewport, props.viewportSize));
/** Moveable 几何预览索引。 */
const geometryPreviewById = computed<Map<string, DrawingGeometryChange>>(
  () => new Map((props.geometryPreviewChanges ?? []).map((change: DrawingGeometryChange): [string, DrawingGeometryChange] => [change.id, change]))
);
/** 画布根节点内联样式。 */
const canvasStyle = computed<CSSProperties>(() => ({
  cursor: props.activeTool === 'text' ? 'text' : undefined
}));

const shapeElements = computed<DrawingShapeElement[]>(() => props.elements.filter(isDrawingShapeElement));
const connectorElements = computed<DrawingConnectorElement[]>(() => props.elements.filter(isDrawingConnectorElement));
/** 当前选中的连接线元素，用于在节点上方渲染端点高亮。 */
const selectedConnectorElements = computed<DrawingConnectorElement[]>(() =>
  connectorElements.value.filter((connector: DrawingConnectorElement): boolean => props.selection.includes(connector.id))
);
/** 当前创建形状草稿，供预览组件使用。 */
const shapeDraft = computed<DrawingCreateShapeDraft | undefined>(() => (props.draft?.kind === 'creating-shape' ? props.draft : undefined));
/** 当前创建连接线草稿，供预览路径使用。 */
const connectorDraft = computed<DrawingCreateConnectorDraft | undefined>(() => (props.draft?.kind === 'creating-connector' ? props.draft : undefined));
/** 创建连接线预览描边色。 */
const connectorPreviewStroke = computed<string>(() => props.draftConnector?.style?.stroke ?? '#64748b');
/** 创建连接线预览描边宽度。 */
const connectorPreviewStrokeWidth = computed<number>(() => props.draftConnector?.style?.strokeWidth ?? 2);
/** 创建连接线预览终点标记。 */
const connectorPreviewMarkerEnd = computed<string | undefined>(() => (props.draftConnector?.markerEnd === 'none' ? undefined : 'url(#b-drawing-arrow)'));
const connectorPreviewPath = computed<string>(() => {
  if (!connectorDraft.value) {
    return '';
  }

  const source = findDrawingShapeElement(props.elements, connectorDraft.value.source.elementId);
  if (!source) {
    return '';
  }

  return createDrawingLinePath(getDrawingConnectorAnchorPoint(source, connectorDraft.value.source.anchor), connectorDraft.value.current);
});

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
  const geometryPreviewSize = geometryPreviewById.value.get(id)?.size;
  if (geometryPreviewSize) {
    return geometryPreviewSize;
  }

  return props.editingElementId === id ? props.editingPreviewSize ?? null : null;
}

/**
 * 转发元素编辑事件。
 * @param id - 元素 ID
 * @param event - 鼠标事件
 */
function handleElementEdit(id: string, event: MouseEvent): void {
  emit('edit', id, event);
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
function getBoardPoint(event: PointerEvent): DrawingPoint {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { ...props.viewport.center };
  }

  const projection = projectClientPointToDrawingBoard({ x: event.clientX, y: event.clientY }, rect, props.viewport);

  return projection?.boardPoint ?? { ...props.viewport.center };
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

  emit('canvas-pointerdown', getBoardPoint(event), event);
}

/**
 * 处理画布空白区域移动。
 * @param event - 指针事件
 */
function handlePointerMove(event: PointerEvent): void {
  emit('canvas-pointermove', getBoardPoint(event), event);
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

  emit('canvas-pointerup', getBoardPoint(event), event);
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

.b-drawing-canvas.is-tool-process {
  cursor: crosshair;
}

.b-drawing-canvas.is-tool-rect,
.b-drawing-canvas.is-tool-ellipse,
.b-drawing-canvas.is-tool-diamond {
  cursor: crosshair;
}

.b-drawing-canvas.is-tool-text {
  cursor: text;
}

/* 形状创建工具激活时，禁止已有节点拦截指针事件，让点击穿透到画布以创建新形状 */
.b-drawing-canvas.is-tool-rect .b-drawing-element,
.b-drawing-canvas.is-tool-ellipse .b-drawing-element,
.b-drawing-canvas.is-tool-diamond .b-drawing-element,
.b-drawing-canvas.is-tool-process .b-drawing-element {
  pointer-events: none;
}

.b-drawing-canvas__svg {
  display: block;
  width: 100%;
  height: 100%;
}

.b-drawing-canvas__connector-preview {
  pointer-events: none;
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 2;
  stroke-dasharray: 6 4;
}

.b-drawing-canvas__svg.is-measuring {
  opacity: 0;
}

.b-drawing-canvas__arrow-head {
  fill: var(--text-tertiary);
}
</style>

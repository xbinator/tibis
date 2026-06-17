<!--
  @file index.vue
  @description 独立画图工具组件。
-->
<template>
  <section ref="rootRef" class="b-drawing" tabindex="0">
    <StylePanel
      :element="selectedShapeElement"
      :connector="selectedConnectorElement"
      :draft-style="activeCreateShape ? creationStyle : null"
      :draft-connector="activeTool === 'connector' ? connectorCreationOptions : null"
      :element-index="selectedElementIndex"
      :element-count="board.state.value.elements.length"
      @change="handleSelectedStyleChange"
      @connector-change="handleSelectedConnectorOptionsChange"
      @layer-change="handleLayerChange"
    />
    <InfiniteViewport>
      <DrawingCanvas
        :elements="board.state.value.elements"
        :selection="board.state.value.selection"
        :editing-element-id="textEditingSession?.id ?? null"
        :editing-preview-size="textEditingPreviewSize"
        :geometry-preview-changes="moveablePreviewChanges"
        :viewport="board.state.value.viewport"
        :viewport-size="viewportSize"
        :viewport-ready="isViewportReady"
        :active-tool="activeTool"
        :draft="board.state.value.draft"
        :draft-style="creationStyle"
        :draft-connector="connectorCreationOptions"
        :connector-hover-endpoint="connectorHoverEndpoint"
        :is-panning="isPanning"
        @edit="handleElementEdit"
        @select="handleElementSelect"
        @element-pointerup="handleElementPointerup"
        @canvas-pointerdown="handleCanvasPointerdown"
        @canvas-pointermove="handleCanvasPointermove"
        @canvas-pointerup="handleCanvasPointerup"
        @canvas-wheel="handleCanvasWheel"
        @connector-endpoint-pointerdown="handleConnectorEndpointPointerdown"
      />
    </InfiniteViewport>
    <TextEditorOverlay
      v-if="textEditingSession"
      v-model="textEditorValue"
      :style="textEditorStyle"
      @commit="commitTextEditor"
      @input="handleTextEditorInput"
      @editor-keydown="handleTextEditorKeydown"
      @ready="setTextEditorRef"
    />
    <MoveableLayer
      :enabled="activeTool === 'select' && !hideMoveableDuringDirectDrag && !textEditingSession"
      :root="rootRef"
      :elements="board.state.value.elements"
      :selection="board.state.value.selection"
      :viewport="board.state.value.viewport"
      :viewport-size="viewportSize"
      @move="board.moveElements"
      @preview-end="handleMoveablePreviewEnd"
      @resize="handleMoveableResize"
      @resize-preview="handleMoveableResizePreview"
    />
    <SelectoLayer
      :root="rootRef"
      :active-tool="activeTool"
      :selection="board.state.value.selection"
      :viewport="board.state.value.viewport"
      :viewport-size="viewportSize"
      @set-selection="board.setSelection"
    />
    <Toolbar
      :zoom="board.state.value.viewport.zoom"
      :active-tool="activeTool"
      :elements="board.state.value.elements"
      :viewport="board.state.value.viewport"
      :viewport-size="viewportSize"
      :can-undo="canUndo"
      :can-redo="canRedo"
      @set-tool="setActiveTool"
      @undo="board.undo"
      @redo="board.redo"
      @zoom-in="viewport.zoomIn"
      @zoom-out="viewport.zoomOut"
      @reset-zoom="viewport.resetZoom"
      @set-center="viewport.setCenter"
      @set-zoom="viewport.setZoom"
    />
  </section>
</template>

<script setup lang="ts">
import type {
  DrawingConnectorAnchor,
  DrawingConnectorDraftOptions,
  DrawingConnectorElementEndpoint,
  DrawingConnectorEndpoint,
  DrawingConnectorEndpointPlacement,
  DrawingConnectorElement,
  DrawingConnectorOptionsChange,
  DrawingData,
  DrawingElement,
  DrawingElementStyle,
  DrawingElementStyleChange,
  DrawingGeometryChange,
  DrawingLayerAction,
  DrawingPoint,
  DrawingShapeElement,
  DrawingShapeType,
  DrawingSize,
  DrawingToolMode
} from './types';
import type { DrawingCanvasPointProjection, DrawingConnectorPathElementOverride } from './utils/drawingGeometry';
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue';
import { useShortcuts } from '@/hooks/useShortcuts';
import InfiniteViewport from './components/InfiniteViewport.vue';
import MoveableLayer from './components/MoveableLayer.vue';
import SelectoLayer from './components/SelectoLayer.vue';
import StylePanel from './components/StylePanel.vue';
import TextEditorOverlay from './components/TextEditorOverlay.vue';
import Toolbar from './components/Toolbar.vue';
import { DRAWING_SHAPE_TOOLS, DRAWING_TEXT_CREATE_CLICK_TOLERANCE, DRAWING_TEXT_ELEMENT_CLICK_CREATE_DELAY } from './constants/interaction';
import { useDrawingBoard } from './hooks/useDrawingBoard';
import { useDrawingInteraction } from './hooks/useDrawingInteraction';
import { useDrawingViewport } from './hooks/useDrawingViewport';
import { useModelSync } from './hooks/useModelSync';
import { useTextEditing } from './hooks/useTextEditing';
import { useViewportSize } from './hooks/useViewportSize';
import DrawingCanvas from './renderers/DrawingCanvas.vue';
import {
  createDrawingConnectorPath,
  clientDeltaToDrawingDelta,
  createDrawingElementTransform,
  createDrawingConnectorMarkerPath,
  createDrawingViewportForElements,
  findDrawingShapeElement,
  getDrawingConnectorAnchorPoint,
  getDrawingConnectorEndpointElementId,
  getDrawingShapeRenderSize,
  getDrawingElementId,
  isDrawingConnectorElementEndpoint,
  isDrawingConnectorElement,
  projectClientPointToDrawingBoard,
  queryDrawingElementTarget,
  resolveDrawingConnectorEndpointPoints
} from './utils/drawingGeometry';

/**
 * 画图组件入参。
 */
interface Props {
  /** 外部双向绑定的轻量画板数据 */
  modelValue?: DrawingData;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 更新外部双向绑定画板数据 */
  'update:modelValue': [value: DrawingData];
}>();

const board = useDrawingBoard(props.modelValue);
const viewport = useDrawingViewport(board);
const interaction = useDrawingInteraction(board);
const activeTool = ref<DrawingToolMode>('select');
/** 创建工具激活时应用到下一个形状的样式。 */
const creationStyle = ref<DrawingElementStyle>({});
/** 连线工具激活时应用到下一条连接线的配置。 */
const connectorCreationOptions = ref<DrawingConnectorDraftOptions>({});
const { rootRef, viewportSize, isViewportReady } = useViewportSize();
const {
  textEditingSession,
  textEditorValue,
  textEditingPreviewSize,
  textEditorStyle,
  setTextEditorRef,
  startTextEditing,
  startConnectorLabelEditing,
  commitTextEditor,
  handleTextEditorInput,
  handleTextEditorKeydown
} = useTextEditing({
  board,
  interaction,
  rootRef,
  viewport,
  viewportSize
});
useModelSync({
  board,
  emitUpdate: (value: DrawingData): void => {
    emit('update:modelValue', value);
  },
  modelValue: toRef(props, 'modelValue')
});
const { registerShortcuts } = useShortcuts();
/** 当前历史栈是否允许撤销。 */
const canUndo = computed<boolean>(() => board.state.value.history.past.length > 0);
/** 当前历史栈是否允许重做。 */
const canRedo = computed<boolean>(() => board.state.value.history.future.length > 0);
/** 是否已执行初始内容视口适配。 */
const initialContentViewportFitted = ref<boolean>(false);
/** 未选中节点直接拖拽期间临时隐藏 Moveable 图层，避免旧选框跟随显示。 */
const hideMoveableDuringDirectDrag = ref<boolean>(false);
/** Moveable 拖拽缩放过程中的临时几何预览。 */
const moveablePreviewChanges = ref<DrawingGeometryChange[]>([]);
/** 当前单选的形状元素，供左侧样式面板编辑。 */
const selectedShapeElement = computed<DrawingShapeElement | null>(() => {
  if (board.state.value.selection.length !== 1) {
    return null;
  }

  return findDrawingShapeElement(board.state.value.elements, board.state.value.selection[0]) ?? null;
});
/** 当前单选的连接线元素，供左侧样式面板编辑。 */
const selectedConnectorElement = computed<DrawingConnectorElement | null>(() => {
  if (board.state.value.selection.length !== 1) {
    return null;
  }

  const element = board.state.value.elements.find((item: DrawingElement): boolean => item.id === board.state.value.selection[0]);

  return element && isDrawingConnectorElement(element) ? element : null;
});

/**
 * 首次打开已有内容时自动适配视口。
 */
function fitInitialContentViewport(): void {
  if (initialContentViewportFitted.value || !isViewportReady.value) {
    return;
  }

  initialContentViewportFitted.value = true;
  if (board.state.value.elements.length === 0) {
    return;
  }

  const nextViewport = createDrawingViewportForElements(board.state.value.elements, viewportSize.value);
  if (!nextViewport) {
    return;
  }

  viewport.setCenter(nextViewport.center);
  viewport.setZoom(nextViewport.zoom);
}

watch(
  [isViewportReady, () => viewportSize.value.width, () => viewportSize.value.height, () => board.state.value.elements.length],
  (): void => {
    fitInitialContentViewport();
  },
  { immediate: true }
);

/** 当前选中元素在元素列表中的索引，供层级控制按钮判断是否可操作。 */
const selectedElementIndex = computed<number>(() => {
  if (board.state.value.selection.length !== 1) {
    return -1;
  }

  return board.state.value.elements.findIndex((item: DrawingElement): boolean => item.id === board.state.value.selection[0]);
});

/**
 * 直接拖拽节点会话。
 */
interface DirectElementDragSession {
  /** 拖拽元素 ID */
  id: string;
  /** 起始浏览器坐标 */
  startClient: DrawingPoint;
  /** 起始画板坐标 */
  startBoard: DrawingPoint | null;
  /** 起始元素位置 */
  startPosition: DrawingPoint;
  /** 最后一次预览位置 */
  currentPosition: DrawingPoint;
  /** 元素尺寸 */
  size: DrawingSize;
  /** 起始旋转角度 */
  rotation: number;
  /** 是否已经产生位移 */
  moved: boolean;
  /** 是否在拖拽结束后选中元素 */
  selectOnEnd: boolean;
  /** 拖拽监听取消器 */
  abortController: AbortController;
}

/**
 * 手型工具平移会话。
 */
interface HandPanSession {
  /** 起始浏览器坐标 */
  startClient: DrawingPoint;
  /** 起始视口中心 */
  startCenter: DrawingPoint;
  /** 起始缩放比例 */
  startZoom: number;
  /** 起始画布渲染尺寸 */
  canvasSize: DrawingSize;
  /** 拖拽监听取消器 */
  abortController: AbortController;
}

/**
 * 连接线拖拽会话。
 */
interface ConnectorDragSession {
  /** 起点 */
  source: DrawingConnectorEndpoint;
  /** 拖拽监听取消器 */
  abortController: AbortController;
}

/**
 * 连接线端点拖拽会话。
 */
interface ConnectorEndpointDragSession {
  /** 连接线 ID */
  connectorId: string;
  /** 端点位置 */
  placement: DrawingConnectorEndpointPlacement;
  /** 拖拽监听取消器 */
  abortController: AbortController;
}

/**
 * 文本工具点击已有元素创建文本的延迟会话。
 */
interface PendingTextElementCreateSession {
  /** 点击起点 */
  start: DrawingPoint;
  /** 当前指针位置 */
  current: DrawingPoint;
  /** 拖拽监听取消器 */
  abortController: AbortController;
  /** 等待双击判定的定时器 */
  timer: ReturnType<typeof setTimeout> | null;
}

let directDragSession: DirectElementDragSession | null = null;
let handPanSession: HandPanSession | null = null;
let connectorDragSession: ConnectorDragSession | null = null;
let connectorEndpointDragSession: ConnectorEndpointDragSession | null = null;
let pendingTextElementCreateSession: PendingTextElementCreateSession | null = null;

/** 手型工具是否正在平移中。 */
const isPanning = ref<boolean>(false);
/** 创建连接线时当前 hover 的目标端点。 */
const connectorHoverEndpoint = ref<DrawingConnectorEndpoint | null>(null);

/**
 * 获取当前工具对应的创建形状。
 * @returns 可创建形状，不是形状工具时返回 null
 */
function getActiveCreateShape(): DrawingShapeType | null {
  return DRAWING_SHAPE_TOOLS.includes(activeTool.value as DrawingShapeType) ? (activeTool.value as DrawingShapeType) : null;
}

/** 当前激活的创建形状。 */
const activeCreateShape = computed<DrawingShapeType | null>(() => getActiveCreateShape());

/**
 * 处理 Moveable 缩放预览。
 * @param changes - 预览几何变更
 */
function handleMoveableResizePreview(changes: DrawingGeometryChange[]): void {
  moveablePreviewChanges.value = changes;
}

/**
 * 清理 Moveable 临时预览。
 */
function handleMoveablePreviewEnd(): void {
  moveablePreviewChanges.value = [];
}

/**
 * 提交 Moveable 缩放并清理预览。
 * @param changes - 几何变更
 */
function handleMoveableResize(changes: DrawingGeometryChange[]): void {
  board.resizeElements(changes);
  handleMoveablePreviewEnd();
}

/**
 * 通过元素 ID 读取形状元素。
 * @param id - 元素 ID
 * @returns 形状元素
 */
function getShapeElementById(id: string): DrawingShapeElement | null {
  return findDrawingShapeElement(board.state.value.elements, id);
}

/**
 * 通过元素 ID 读取画板元素。
 * @param id - 元素 ID
 * @returns 画板元素
 */
function getElementById(id: string): DrawingElement | null {
  return board.state.value.elements.find((element: DrawingElement): boolean => element.id === id) ?? null;
}

/**
 * 通过元素 ID 读取 SVG DOM 节点。
 * @param id - 元素 ID
 * @returns SVG DOM 节点
 */
function getElementTargetById(id: string): Element | null {
  return queryDrawingElementTarget(rootRef.value, id);
}

/**
 * 通过元素 ID 读取全部 SVG DOM 节点。
 * @param id - 元素 ID
 * @returns SVG DOM 节点列表
 */
function getElementTargetsById(id: string): Element[] {
  return Array.from(rootRef.value?.querySelectorAll(`[data-drawing-element-id="${id}"]`) ?? []);
}

/**
 * 读取画布渲染尺寸。
 * @returns 画布渲染尺寸，无法读取时返回 null
 */
function getCanvasSize(): DrawingSize | null {
  if (viewportSize.value.width && viewportSize.value.height) {
    return { ...viewportSize.value };
  }

  const rect = rootRef.value?.getBoundingClientRect();
  if (!rect?.width || !rect.height) {
    return null;
  }

  return {
    width: rect.width,
    height: rect.height
  };
}

/**
 * 将浏览器坐标投影到画板坐标系。
 * @param clientX - 浏览器横坐标
 * @param clientY - 浏览器纵坐标
 * @returns 画布投影信息，无法读取画布尺寸时返回 null
 */
function getCanvasPointProjection(clientX: number, clientY: number): DrawingCanvasPointProjection | null {
  const rect = rootRef.value?.getBoundingClientRect();
  if (!rect) {
    return null;
  }

  return projectClientPointToDrawingBoard({ x: clientX, y: clientY }, rect, board.state.value.viewport);
}

/**
 * 将浏览器指针位置转换为画板坐标。
 * @param event - 指针事件
 * @returns 画板坐标，无法读取画布尺寸时返回 null
 */
function getBoardPointFromPointer(event: PointerEvent): DrawingPoint | null {
  return getCanvasPointProjection(event.clientX, event.clientY)?.boardPoint ?? null;
}

/**
 * 从事件目标读取画板元素 ID。
 * @param target - 事件目标
 * @returns 元素 ID
 */
function getElementIdFromEventTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const elementTarget = target.closest('.b-drawing-element');

  return getDrawingElementId(elementTarget);
}

/**
 * 从浏览器坐标命中读取画板元素 ID。
 * @param clientX - 浏览器横坐标
 * @param clientY - 浏览器纵坐标
 * @returns 元素 ID
 */
function getElementIdFromClientPoint(clientX: number, clientY: number): string | null {
  if (typeof document.elementFromPoint !== 'function') {
    return null;
  }

  const elementTarget = document.elementFromPoint(clientX, clientY);

  return getElementIdFromEventTarget(elementTarget);
}

/**
 * 从连接线释放事件读取目标元素 ID。
 * @param event - 指针事件
 * @param sourceId - 起点元素 ID，点位端点传 null
 * @returns 目标元素 ID
 */
function getConnectorTargetIdFromPointer(event: PointerEvent, sourceId: string | null): string | null {
  const eventTargetId = getElementIdFromEventTarget(event.target);
  if (eventTargetId && eventTargetId !== sourceId) {
    return eventTargetId;
  }

  const pointTargetId = getElementIdFromClientPoint(event.clientX, event.clientY);
  if (pointTargetId && pointTargetId !== sourceId) {
    return pointTargetId;
  }

  return null;
}

/**
 * 根据指针位置推断最近的连接锚点。
 * @param element - 形状元素
 * @param point - 画板坐标
 * @returns 连接锚点
 */
function getConnectorAnchorFromPoint(element: DrawingShapeElement, point: DrawingPoint): Exclude<DrawingConnectorAnchor, 'center'> {
  const center = getDrawingConnectorAnchorPoint(element, 'center');
  const size = getDrawingShapeRenderSize(element);
  const normalizedX = (point.x - center.x) / Math.max(size.width, 1);
  const normalizedY = (point.y - center.y) / Math.max(size.height, 1);

  if (Math.abs(normalizedX) > Math.abs(normalizedY)) {
    return normalizedX >= 0 ? 'right' : 'left';
  }

  return normalizedY >= 0 ? 'bottom' : 'top';
}

/**
 * 根据指针事件读取连接端点。
 * @param id - 元素 ID
 * @param event - 指针事件
 * @returns 连接端点
 */
function getConnectorEndpointFromPointer(id: string, event: PointerEvent): DrawingConnectorElementEndpoint | null {
  const element = getShapeElementById(id);
  if (!element) {
    return null;
  }

  const point = getBoardPointFromPointer(event);
  if (!point) {
    return {
      elementId: id,
      anchor: 'center'
    };
  }

  return {
    elementId: id,
    anchor: getConnectorAnchorFromPoint(element, point)
  };
}

/**
 * 创建 SVG 节点 transform 字符串。
 * @param position - 元素位置
 * @param session - 拖拽会话
 * @returns SVG transform
 */
function createDirectDragTransform(position: DrawingPoint, session: DirectElementDragSession): string {
  return createDrawingElementTransform(position, session.size, session.rotation);
}

/**
 * 将连接线几何同步到 SVG DOM。
 * @param connector - 待同步连接线
 * @param overrides - 预览几何覆盖
 */
function syncConnectorPreviewDom(connector: DrawingConnectorElement, overrides: DrawingConnectorPathElementOverride[] = []): void {
  const pathData = createDrawingConnectorPath(board.state.value.elements, connector, overrides);
  const markerStartPath = createDrawingConnectorMarkerPath(board.state.value.elements, connector, 'start', overrides);
  const markerEndPath = createDrawingConnectorMarkerPath(board.state.value.elements, connector, 'end', overrides);
  const endpointPoints = resolveDrawingConnectorEndpointPoints(board.state.value.elements, connector, overrides);
  const targets = getElementTargetsById(connector.id);
  targets.forEach((target: Element): void => {
    const paths = target.querySelectorAll('.b-drawing-connector__line, .b-drawing-connector__hit');
    paths.forEach((path: Element): void => {
      path.setAttribute('d', pathData);
    });
    target.querySelector('.b-drawing-connector__marker-arrow--start')?.setAttribute('d', markerStartPath);
    target.querySelector('.b-drawing-connector__marker-arrow--end')?.setAttribute('d', markerEndPath);

    const endpoints = target.querySelectorAll('.b-drawing-connector__endpoint');
    if (endpointPoints && endpoints.length >= 2) {
      endpoints[0].setAttribute('cx', String(endpointPoints.source.x));
      endpoints[0].setAttribute('cy', String(endpointPoints.source.y));
      endpoints[1].setAttribute('cx', String(endpointPoints.target.x));
      endpoints[1].setAttribute('cy', String(endpointPoints.target.y));
    }
  });
}

/**
 * 更新关联连接线的拖拽预览路径。
 * @param elementId - 正在预览变更的元素 ID
 * @param overrides - 预览几何覆盖
 */
function updateConnectedConnectorPreviews(elementId: string, overrides: DrawingConnectorPathElementOverride[]): void {
  const connectors = board.state.value.elements.filter(
    (element: DrawingElement): boolean =>
      isDrawingConnectorElement(element) &&
      (getDrawingConnectorEndpointElementId(element.source) === elementId || getDrawingConnectorEndpointElementId(element.target) === elementId)
  );

  for (const connector of connectors) {
    if (!isDrawingConnectorElement(connector)) {
      continue;
    }

    syncConnectorPreviewDom(connector, overrides);
  }
}

/**
 * 根据浏览器坐标计算直接拖拽位置。
 * @param event - 指针事件
 * @param session - 拖拽会话
 * @returns 新位置
 */
function getDirectDragPosition(event: PointerEvent, session: DirectElementDragSession): DrawingPoint {
  const currentBoardPoint = getBoardPointFromPointer(event);
  if (currentBoardPoint && session.startBoard) {
    return {
      x: session.startPosition.x + currentBoardPoint.x - session.startBoard.x,
      y: session.startPosition.y + currentBoardPoint.y - session.startBoard.y
    };
  }

  return {
    x: session.startPosition.x + (event.clientX - session.startClient.x) / board.state.value.viewport.zoom,
    y: session.startPosition.y + (event.clientY - session.startClient.y) / board.state.value.viewport.zoom
  };
}

/**
 * 取消直接拖拽。
 */
function cancelDirectDrag(): void {
  directDragSession?.abortController.abort();
  directDragSession = null;
  hideMoveableDuringDirectDrag.value = false;
}

/**
 * 取消连接线拖拽。
 */
function cancelConnectorDrag(): void {
  connectorDragSession?.abortController.abort();
  connectorDragSession = null;
  connectorHoverEndpoint.value = null;
  board.clearDraft();
}

/**
 * 取消连接线端点拖拽。
 */
function cancelConnectorEndpointDrag(): void {
  connectorEndpointDragSession?.abortController.abort();
  connectorEndpointDragSession = null;
}

/**
 * 取消手型工具平移。 */
function cancelHandPan(): void {
  handPanSession?.abortController.abort();
  handPanSession = null;
  isPanning.value = false;
}

/**
 * 设置当前画板工具。
 * @param tool - 目标工具
 */
function setActiveTool(tool: DrawingToolMode): void {
  board.clearDraft();
  cancelHandPan();
  cancelConnectorDrag();
  cancelConnectorEndpointDrag();
  activeTool.value = tool;

  if (tool !== 'select') {
    board.setSelection([]);
  }
}

/**
 * 更新当前选中节点样式。
 * @param style - 样式变更
 */
function handleSelectedStyleChange(style: DrawingElementStyleChange): void {
  if (selectedShapeElement.value) {
    board.updateElementStyle(selectedShapeElement.value.id, style);
    return;
  }

  if (selectedConnectorElement.value) {
    board.updateElementStyle(selectedConnectorElement.value.id, style);
    return;
  }

  if (!activeCreateShape.value) {
    if (activeTool.value === 'connector') {
      connectorCreationOptions.value = {
        ...connectorCreationOptions.value,
        style: {
          ...connectorCreationOptions.value.style,
          ...style
        }
      };
    }

    return;
  }

  creationStyle.value = {
    ...creationStyle.value,
    ...style
  };
}

/**
 * 更新当前选中连接线配置。
 * @param options - 连接线配置变更
 */
function handleSelectedConnectorOptionsChange(options: DrawingConnectorOptionsChange): void {
  if (selectedConnectorElement.value) {
    board.updateConnectorOptions(selectedConnectorElement.value.id, options);
    return;
  }

  if (activeTool.value !== 'connector') {
    return;
  }

  connectorCreationOptions.value = {
    ...connectorCreationOptions.value,
    ...options
  };
}

/**
 * 处理层级变更。
 * @param action - 层级操作类型
 */
function handleLayerChange(action: DrawingLayerAction): void {
  if (board.state.value.selection.length !== 1) {
    return;
  }

  board.reorderElement(board.state.value.selection[0], action);
}

/**
 * 判断文本创建手势是否为点击。
 * @param start - 创建起点
 * @param end - 创建终点
 * @returns 是否为点击创建
 */
function isTextCreateClick(start: DrawingPoint, end: DrawingPoint): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) <= DRAWING_TEXT_CREATE_CLICK_TOLERANCE;
}

/**
 * 在指定画板坐标创建文本并进入编辑。
 * @param point - 文本创建位置
 */
async function createTextElementAtPoint(point: DrawingPoint): Promise<void> {
  board.startCreateShapeDraft('text', point);
  board.updateDraftPoint(point);
  board.commitCreateShapeDraft(creationStyle.value);
  const createdElement = findDrawingShapeElement(board.state.value.elements, board.state.value.selection[0]);
  setActiveTool('select');
  if (createdElement) {
    await startTextEditing(createdElement, true);
  }
}

/**
 * 取消点击已有元素创建文本的待执行动作。
 */
function cancelPendingTextElementCreate(): void {
  if (!pendingTextElementCreateSession) {
    return;
  }

  pendingTextElementCreateSession.abortController.abort();
  if (pendingTextElementCreateSession.timer !== null) {
    clearTimeout(pendingTextElementCreateSession.timer);
  }
  pendingTextElementCreateSession = null;
}

/**
 * 更新点击已有元素创建文本时的指针位置。
 * @param event - 指针事件
 */
function handlePendingTextElementCreateMove(event: PointerEvent): void {
  if (!pendingTextElementCreateSession) {
    return;
  }

  const point = getBoardPointFromPointer(event);
  if (point) {
    pendingTextElementCreateSession.current = point;
  }
}

/**
 * 结束点击已有元素创建文本的手势，并等待双击判定。
 * @param event - 指针事件
 */
function finishPendingTextElementCreate(event: PointerEvent): void {
  const session = pendingTextElementCreateSession;
  if (!session) {
    return;
  }

  const point = getBoardPointFromPointer(event) ?? session.current;
  session.current = point;
  session.abortController.abort();
  if (!isTextCreateClick(session.start, point)) {
    cancelPendingTextElementCreate();
    return;
  }

  session.timer = setTimeout((): void => {
    const createPoint = session.current;
    pendingTextElementCreateSession = null;
    createTextElementAtPoint(createPoint).catch((error: unknown): void => {
      console.warn('BDrawing text element create failed', error);
    });
  }, DRAWING_TEXT_ELEMENT_CLICK_CREATE_DELAY);
}

/**
 * 从已有元素上启动文本创建点击手势。
 * @param event - 指针事件
 */
function startPendingTextElementCreate(event: PointerEvent): void {
  const point = getBoardPointFromPointer(event);
  if (!point) {
    return;
  }

  cancelPendingTextElementCreate();
  const abortController = new AbortController();
  pendingTextElementCreateSession = {
    start: point,
    current: point,
    abortController,
    timer: null
  };

  window.addEventListener('pointermove', handlePendingTextElementCreateMove, { signal: abortController.signal });
  window.addEventListener('pointerup', finishPendingTextElementCreate, { signal: abortController.signal });
  window.addEventListener('pointercancel', cancelPendingTextElementCreate, { signal: abortController.signal });
}

/**
 * 处理手型工具平移移动。
 * @param event - 指针事件
 */
function handleHandPanMove(event: PointerEvent): void {
  if (!handPanSession) {
    return;
  }

  const delta = clientDeltaToDrawingDelta(
    {
      x: event.clientX - handPanSession.startClient.x,
      y: event.clientY - handPanSession.startClient.y
    },
    handPanSession.canvasSize,
    handPanSession.startZoom
  );
  if (!delta) {
    return;
  }

  viewport.setCenter({
    x: handPanSession.startCenter.x - delta.x,
    y: handPanSession.startCenter.y - delta.y
  });
}

/**
 * 结束手型工具平移。
 */
function handleHandPanEnd(): void {
  cancelHandPan();
}

/**
 * 开始手型工具平移。
 * @param event - 指针事件
 */
function startHandPan(event: PointerEvent): void {
  const canvasSize = getCanvasSize();
  if (!canvasSize) {
    return;
  }

  const abortController = new AbortController();
  cancelHandPan();
  isPanning.value = true;
  handPanSession = {
    startClient: {
      x: event.clientX,
      y: event.clientY
    },
    startCenter: { ...board.state.value.viewport.center },
    startZoom: board.state.value.viewport.zoom,
    canvasSize,
    abortController
  };

  window.addEventListener('pointermove', handleHandPanMove, { signal: abortController.signal });
  window.addEventListener('pointerup', handleHandPanEnd, { signal: abortController.signal });
  window.addEventListener('pointercancel', handleHandPanEnd, { signal: abortController.signal });
}

/**
 * 处理直接拖拽移动。
 * @param event - 指针事件
 */
function handleDirectDragMove(event: PointerEvent): void {
  if (!directDragSession) {
    return;
  }

  const position = getDirectDragPosition(event, directDragSession);
  const target = getElementTargetById(directDragSession.id);
  target?.setAttribute('transform', createDirectDragTransform(position, directDragSession));
  updateConnectedConnectorPreviews(directDragSession.id, [
    {
      id: directDragSession.id,
      position
    }
  ]);
  directDragSession.currentPosition = position;
  directDragSession.moved = true;
}

/**
 * 处理直接拖拽结束。
 */
function handleDirectDragEnd(): void {
  if (!directDragSession) {
    return;
  }

  const session = directDragSession;
  session.abortController.abort();
  directDragSession = null;

  if (!session.moved) {
    if (session.selectOnEnd) {
      board.setSelection([session.id]);
    }
    hideMoveableDuringDirectDrag.value = false;
    return;
  }

  board.moveElements([
    {
      id: session.id,
      position: session.currentPosition
    }
  ]);
  if (session.selectOnEnd) {
    board.setSelection([session.id]);
  }
  hideMoveableDuringDirectDrag.value = false;
}

/**
 * 处理直接拖拽取消。
 */
function handleDirectDragCancel(): void {
  cancelDirectDrag();
}

/**
 * 开始直接拖拽节点。
 * @param id - 元素 ID
 * @param event - 指针事件
 * @param selectOnEnd - 是否在拖拽结束后选中
 */
function startDirectDrag(id: string, event: PointerEvent, selectOnEnd: boolean): void {
  const element = getShapeElementById(id);
  if (!element) {
    return;
  }

  const abortController = new AbortController();
  cancelDirectDrag();
  hideMoveableDuringDirectDrag.value = selectOnEnd;
  directDragSession = {
    id,
    startClient: {
      x: event.clientX,
      y: event.clientY
    },
    startBoard: getBoardPointFromPointer(event),
    startPosition: { ...element.position },
    currentPosition: { ...element.position },
    size: { ...element.size },
    rotation: element.rotation,
    moved: false,
    selectOnEnd,
    abortController
  };

  window.addEventListener('pointermove', handleDirectDragMove, { signal: abortController.signal });
  window.addEventListener('pointerup', handleDirectDragEnd, { signal: abortController.signal });
  window.addEventListener('pointercancel', handleDirectDragCancel, { signal: abortController.signal });
}

/**
 * 处理连接线拖拽移动。
 * @param event - 指针事件
 */
function handleConnectorDragMove(event: PointerEvent): void {
  if (!connectorDragSession) {
    return;
  }

  const sourceId = getDrawingConnectorEndpointElementId(connectorDragSession.source);
  const targetId = getConnectorTargetIdFromPointer(event, sourceId);
  connectorHoverEndpoint.value = targetId ? getConnectorEndpointFromPointer(targetId, event) : null;

  const point = getBoardPointFromPointer(event);
  if (!point) {
    return;
  }

  board.updateConnectorDraftPoint(point);
}

/**
 * 完成连接线拖拽。
 * @param target - 目标端点
 */
function finishConnectorDrag(target: DrawingConnectorEndpoint | null): void {
  if (!connectorDragSession) {
    return;
  }

  connectorDragSession.abortController.abort();
  connectorDragSession = null;
  connectorHoverEndpoint.value = null;

  if (!target) {
    board.clearDraft();
    return;
  }

  board.commitCreateConnectorDraft(target, connectorCreationOptions.value);
  setActiveTool('select');
}

/**
 * 处理连接线拖拽结束。
 * @param event - 指针事件
 */
function handleConnectorDragEnd(event: PointerEvent): void {
  if (!connectorDragSession) {
    return;
  }

  const { source } = connectorDragSession;
  const sourceId = getDrawingConnectorEndpointElementId(source);
  const targetId = getConnectorTargetIdFromPointer(event, sourceId);
  const targetPoint = getBoardPointFromPointer(event);
  let target: DrawingConnectorEndpoint | null = null;
  if (targetId) {
    target = getConnectorEndpointFromPointer(targetId, event);
  } else if (targetPoint) {
    target = { point: targetPoint };
  }

  finishConnectorDrag(target);
}

/**
 * 根据指针位置创建连接线端点。
 * @param event - 指针事件
 * @returns 连接线端点
 */
function createConnectorEndpointFromPointer(event: PointerEvent): DrawingConnectorEndpoint | null {
  const targetId = getConnectorTargetIdFromPointer(event, null);
  if (targetId) {
    return getConnectorEndpointFromPointer(targetId, event);
  }

  const point = getBoardPointFromPointer(event);

  return point ? { point } : null;
}

/**
 * 处理连接线端点拖拽结束。
 * @param event - 指针事件
 */
function handleConnectorEndpointDragEnd(event: PointerEvent): void {
  if (!connectorEndpointDragSession) {
    return;
  }

  const session = connectorEndpointDragSession;
  const endpoint = createConnectorEndpointFromPointer(event);
  cancelConnectorEndpointDrag();
  if (!endpoint) {
    return;
  }

  board.updateConnectorEndpoint(session.connectorId, session.placement, endpoint);
}

/**
 * 创建端点拖拽预览连接线。
 * @param session - 端点拖拽会话
 * @param endpoint - 预览端点
 * @returns 预览连接线
 */
function createConnectorEndpointPreview(session: ConnectorEndpointDragSession, endpoint: DrawingConnectorEndpoint): DrawingConnectorElement | null {
  const element = getElementById(session.connectorId);
  if (!element || !isDrawingConnectorElement(element)) {
    return null;
  }

  return {
    ...element,
    source: session.placement === 'source' ? endpoint : element.source,
    target: session.placement === 'target' ? endpoint : element.target
  };
}

/**
 * 处理连接线端点拖拽移动。
 * @param event - 指针事件
 */
function handleConnectorEndpointDragMove(event: PointerEvent): void {
  if (!connectorEndpointDragSession) {
    return;
  }

  const endpoint = createConnectorEndpointFromPointer(event);
  if (!endpoint) {
    return;
  }

  const connector = createConnectorEndpointPreview(connectorEndpointDragSession, endpoint);
  if (!connector) {
    return;
  }

  syncConnectorPreviewDom(connector);
}

/**
 * 开始拖拽连接线端点。
 * @param id - 连接线 ID
 * @param placement - 端点位置
 */
function handleConnectorEndpointPointerdown(id: string, placement: DrawingConnectorEndpointPlacement): void {
  const abortController = new AbortController();
  cancelConnectorEndpointDrag();
  cancelConnectorDrag();
  cancelDirectDrag();
  board.setSelection([id]);
  connectorEndpointDragSession = {
    connectorId: id,
    placement,
    abortController
  };

  window.addEventListener('pointermove', handleConnectorEndpointDragMove, { signal: abortController.signal });
  window.addEventListener('pointerup', handleConnectorEndpointDragEnd, { signal: abortController.signal });
  window.addEventListener('pointercancel', cancelConnectorEndpointDrag, { signal: abortController.signal });
}

/**
 * 处理连接线拖拽取消。
 */
function handleConnectorDragCancel(): void {
  cancelConnectorDrag();
}

/**
 * 开始拖拽创建连接线。
 * @param id - 起点元素 ID
 * @param event - 指针事件
 */
function startConnectorDrag(id: string, event: PointerEvent): void {
  const source = getConnectorEndpointFromPointer(id, event);
  if (!source) {
    return;
  }

  const sourceElement = getShapeElementById(source.elementId);
  if (!sourceElement) {
    return;
  }

  const abortController = new AbortController();
  cancelConnectorDrag();
  connectorDragSession = {
    source,
    abortController
  };
  board.startCreateConnectorDraft(source, getDrawingConnectorAnchorPoint(sourceElement, source.anchor));

  window.addEventListener('pointermove', handleConnectorDragMove, { signal: abortController.signal });
  window.addEventListener('pointerup', handleConnectorDragEnd, { signal: abortController.signal });
  window.addEventListener('pointercancel', handleConnectorDragCancel, { signal: abortController.signal });
}

/**
 * 开始从空白画布拖拽创建自由连接线。
 * @param point - 起点画布坐标
 */
function startFreeConnectorDrag(point: DrawingPoint): void {
  const source: DrawingConnectorEndpoint = {
    point
  };
  const abortController = new AbortController();
  cancelConnectorDrag();
  connectorDragSession = {
    source,
    abortController
  };
  board.startCreateConnectorDraft(source, point);

  window.addEventListener('pointermove', handleConnectorDragMove, { signal: abortController.signal });
  window.addEventListener('pointerup', handleConnectorDragEnd, { signal: abortController.signal });
  window.addEventListener('pointercancel', handleConnectorDragCancel, { signal: abortController.signal });
}

/**
 * 处理元素上释放指针。
 * @param id - 元素 ID
 * @param event - 指针事件
 */
function handleElementPointerup(id: string, event: PointerEvent): void {
  if (activeTool.value === 'text') {
    finishPendingTextElementCreate(event);
    return;
  }

  if (activeTool.value !== 'connector') {
    handleDirectDragEnd();
    return;
  }

  if (!connectorDragSession || (isDrawingConnectorElementEndpoint(connectorDragSession.source) && connectorDragSession.source.elementId === id)) {
    return;
  }

  finishConnectorDrag(getConnectorEndpointFromPointer(id, event));
}

/**
 * 处理元素点击。
 * @param id - 元素 ID
 * @param event - 指针事件
 */
function handleElementSelect(id: string, event: PointerEvent): void {
  if (activeTool.value === 'hand') {
    return;
  }

  if (activeTool.value === 'text') {
    startPendingTextElementCreate(event);
    return;
  }

  /* 形状创建工具（rect/ellipse/diamond/text/process）激活时，禁止选中已有节点，让点击穿透到画布创建形状 */
  if (getActiveCreateShape()) {
    return;
  }

  if (activeTool.value !== 'connector') {
    if (board.state.value.selection.includes(id)) {
      return;
    }

    const element = getElementById(id);
    if (element && isDrawingConnectorElement(element)) {
      board.setSelection([id]);
      return;
    }

    board.setSelection([]);
    startDirectDrag(id, event, true);
    return;
  }

  startConnectorDrag(id, event);
}

/**
 * 处理元素编辑。
 * @param id - 元素 ID
 */
async function handleElementEdit(id: string): Promise<void> {
  cancelPendingTextElementCreate();
  const element = getElementById(id);
  if (!element) {
    return;
  }

  cancelDirectDrag();
  board.setSelection([id]);
  setActiveTool('select');
  if (isDrawingConnectorElement(element)) {
    await startConnectorLabelEditing(element);
    return;
  }

  await startTextEditing(element, false);
}

/**
 * 处理画布空白区域按下。
 * @param point - 画板坐标
 */
function handleCanvasPointerdown(point: DrawingPoint, event: PointerEvent): void {
  if (activeTool.value === 'hand') {
    startHandPan(event);
    return;
  }

  if (activeTool.value === 'connector') {
    startFreeConnectorDrag(point);
    return;
  }

  const shape = getActiveCreateShape();
  if (shape) {
    board.startCreateShapeDraft(shape, point);
    return;
  }

  interaction.clearSelection();
}

/**
 * 处理画布空白区域移动。
 * @param point - 画板坐标
 */
function handleCanvasPointermove(point: DrawingPoint): void {
  board.updateDraftPoint(point);
}

/**
 * 处理画布空白区域抬起。
 * @param point - 画板坐标
 */
async function handleCanvasPointerup(point: DrawingPoint): Promise<void> {
  const { draft } = board.state.value;
  if (draft?.kind !== 'creating-shape') {
    return;
  }

  if (draft.shape === 'text' && !isTextCreateClick(draft.start, point)) {
    board.clearDraft();
    return;
  }

  board.updateDraftPoint(point);
  board.commitCreateShapeDraft(creationStyle.value);
  const createdElement = findDrawingShapeElement(board.state.value.elements, board.state.value.selection[0]);
  setActiveTool('select');
  if (draft.shape === 'text' && createdElement) {
    await startTextEditing(createdElement, true);
  }
}

/**
 * 处理画布滚轮缩放。
 * @param event - 滚轮事件
 */
function handleCanvasWheel(event: WheelEvent): void {
  if (!event.ctrlKey && !event.metaKey) {
    if (event.deltaX === 0 && event.deltaY === 0) {
      return;
    }

    const canvasSize = getCanvasSize();
    if (!canvasSize) {
      return;
    }

    event.preventDefault();
    viewport.panByClientDelta({ x: event.deltaX, y: event.deltaY }, canvasSize);
    return;
  }

  if (event.deltaY === 0) {
    return;
  }

  const projection = getCanvasPointProjection(event.clientX, event.clientY);

  event.preventDefault();
  if (event.deltaY < 0) {
    if (projection) {
      viewport.zoomInAt(projection);
      return;
    }

    viewport.zoomIn();
    return;
  }

  if (projection) {
    viewport.zoomOutAt(projection);
    return;
  }

  viewport.zoomOut();
}

/**
 * 判断键盘事件是否来自可编辑输入区域。
 * @param event - 键盘事件
 * @returns 是否来自输入区域
 */
function isKeyboardEventFromEditableTarget(event: KeyboardEvent): boolean {
  const { target } = event;
  if (!(target instanceof Element)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest('[contenteditable="true"]') !== null
  );
}

/**
 * 判断画板局部快捷键是否可响应当前键盘事件。
 * @param event - 键盘事件
 * @returns 是否允许响应画板快捷键
 */
function canHandleDrawingShortcut(event: KeyboardEvent): boolean {
  const { target } = event;

  return target instanceof Element && rootRef.value?.contains(target) === true && !isKeyboardEventFromEditableTarget(event);
}

/**
 * 选中画板中的全部元素。
 */
function selectAllDrawingElements(): void {
  board.setSelection(board.state.value.elements.map((element: DrawingElement): string => element.id));
}

/**
 * 注册画板键盘快捷键。
 * @returns 取消快捷键注册的函数
 */
function registerDrawingKeyboardShortcuts(): () => void {
  return registerShortcuts([
    {
      key: 'Ctrl+Z',
      handler: board.undo,
      guard: canHandleDrawingShortcut
    },
    {
      key: 'Ctrl+Shift+Z',
      handler: board.redo,
      guard: canHandleDrawingShortcut
    },
    {
      key: 'Ctrl+Y',
      handler: board.redo,
      guard: canHandleDrawingShortcut
    },
    {
      key: 'Ctrl+A',
      handler: selectAllDrawingElements,
      guard: canHandleDrawingShortcut
    },
    {
      key: 'Delete',
      handler: interaction.deleteSelection,
      guard: canHandleDrawingShortcut
    },
    {
      key: 'Backspace',
      handler: interaction.deleteSelection,
      guard: canHandleDrawingShortcut
    }
  ]);
}

const unregisterDrawingKeyboardShortcuts = registerDrawingKeyboardShortcuts();

onBeforeUnmount((): void => {
  unregisterDrawingKeyboardShortcuts();
  cancelHandPan();
  cancelDirectDrag();
  cancelConnectorDrag();
  cancelConnectorEndpointDrag();
  cancelPendingTextElementCreate();
});
</script>

<style lang="less" scoped>
.b-drawing {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  outline: none;
  background: var(--bg-primary);
  border-radius: 8px;
}
</style>

<!--
  @file index.vue
  @description 独立画图工具组件。
-->
<template>
  <section ref="rootRef" class="b-drawing" tabindex="0" @keydown="handleKeydown">
    <DrawingToolbar
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
    <DrawingStylePanel
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
    <DrawingInfiniteViewport>
      <DrawingCanvas
        :elements="board.state.value.elements"
        :edges="board.state.value.edges"
        :selection="board.state.value.selection"
        :editing-element-id="textEditingSession?.id ?? null"
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
      />
    </DrawingInfiniteViewport>
    <textarea
      v-if="textEditingSession"
      ref="textEditorRef"
      v-model="textEditorValue"
      class="b-drawing__text-editor"
      data-testid="drawing-text-editor"
      spellcheck="false"
      wrap="off"
      :style="textEditorStyle"
      @blur="commitTextEditor"
      @input="handleTextEditorInput"
      @keydown.stop="handleTextEditorKeydown"
      @pointerdown.stop
    ></textarea>
    <DrawingMoveableLayer
      :enabled="activeTool === 'select' && !hideMoveableDuringDirectDrag && !textEditingSession"
      :root="rootRef"
      :elements="board.state.value.elements"
      :selection="board.state.value.selection"
      :viewport="board.state.value.viewport"
      :viewport-size="viewportSize"
      @move="board.moveElements"
      @resize="board.resizeElements"
    />
    <DrawingSelectoLayer :root="rootRef" :active-tool="activeTool" :selection="board.state.value.selection" @set-selection="board.setSelection" />
  </section>
</template>

<script setup lang="ts">
import type {
  DrawingConnectorAnchor,
  DrawingConnectorDraftOptions,
  DrawingConnectorEndpoint,
  DrawingConnectorElement,
  DrawingConnectorOptionsChange,
  DrawingData,
  DrawingElement,
  DrawingElementStyle,
  DrawingElementStyleChange,
  DrawingLayerAction,
  DrawingPoint,
  DrawingShapeElement,
  DrawingShapeType,
  DrawingSize,
  DrawingToolMode
} from './types';
import type { DrawingCanvasPointProjection, DrawingConnectorPathElementOverride } from './utils/drawingGeometry';
import type { CSSProperties } from 'vue';
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { isEqual } from 'lodash-es';
import DrawingInfiniteViewport from './components/DrawingInfiniteViewport.vue';
import DrawingMoveableLayer from './components/DrawingMoveableLayer.vue';
import DrawingSelectoLayer from './components/DrawingSelectoLayer.vue';
import DrawingStylePanel from './components/DrawingStylePanel.vue';
import DrawingToolbar from './components/DrawingToolbar.vue';
import { useDrawingBoard } from './hooks/useDrawingBoard';
import { useDrawingInteraction } from './hooks/useDrawingInteraction';
import { useDrawingViewport } from './hooks/useDrawingViewport';
import DrawingCanvas from './renderers/DrawingCanvas.vue';
import {
  DRAWING_TEXT_DEFAULT_FONT_SIZE,
  DRAWING_TEXT_DEFAULT_FONT_WEIGHT,
  DRAWING_TEXT_HORIZONTAL_PADDING,
  DRAWING_TEXT_LINE_HEIGHT_RATIO,
  DRAWING_TEXT_VERTICAL_PADDING,
  createDrawingDataSnapshot,
  measureDrawingTextElementSize
} from './utils/boardTransforms';
import {
  createDrawingConnectorPath,
  clientDeltaToDrawingDelta,
  createDrawingElementTransform,
  createDrawingConnectorMarkerPath,
  findDrawingShapeElement,
  getDrawingConnectorAnchorPoint,
  getDrawingShapeRenderSize,
  getDrawingElementId,
  isDrawingConnectorElement,
  projectClientPointToDrawingBoard,
  queryDrawingElementTarget
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
let syncingModelValueToBoard = false;
/** 创建工具激活时应用到下一个形状的样式。 */
const creationStyle = ref<DrawingElementStyle>({});
/** 连线工具激活时应用到下一条连接线的配置。 */
const connectorCreationOptions = ref<DrawingConnectorDraftOptions>({});
const rootRef = ref<HTMLElement | null>(null);
/** 当前画布视口实际渲染尺寸。 */
const viewportSize = ref<DrawingSize>({ width: 0, height: 0 });
/** 画布首轮尺寸稳定后再显示 SVG，避免初始布局抖动产生黑框。 */
const isViewportReady = ref<boolean>(false);
let viewportReadyFrame: ReturnType<typeof requestAnimationFrame> | null = null;
let viewportSizeSyncFrame: ReturnType<typeof requestAnimationFrame> | null = null;
/** 当前历史栈是否允许撤销。 */
const canUndo = computed<boolean>(() => board.state.value.history.past.length > 0);
/** 当前历史栈是否允许重做。 */
const canRedo = computed<boolean>(() => board.state.value.history.future.length > 0);
/** 未选中节点直接拖拽期间临时隐藏 Moveable 图层，避免旧选框跟随显示。 */
const hideMoveableDuringDirectDrag = ref<boolean>(false);
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

/** 当前选中元素在元素列表中的索引，供层级控制按钮判断是否可操作。 */
const selectedElementIndex = computed<number>(() => {
  if (board.state.value.selection.length !== 1) {
    return -1;
  }

  return board.state.value.elements.findIndex((item: DrawingElement): boolean => item.id === board.state.value.selection[0]);
});

/**
 * 判断外部画板数据与内部状态是否一致。
 * @param modelValue - 外部画板数据
 * @returns 是否一致
 */
function isModelValueEqualToBoard(modelValue: DrawingData): boolean {
  return isEqual(createDrawingDataSnapshot(modelValue), createDrawingDataSnapshot(board.state.value));
}

watch(
  () => props.modelValue,
  (modelValue: DrawingData | undefined): void => {
    if (!modelValue || isModelValueEqualToBoard(modelValue)) {
      return;
    }

    syncingModelValueToBoard = true;
    board.reset(modelValue);
    nextTick()
      .then((): void => {
        syncingModelValueToBoard = false;
      })
      .catch((error: unknown): void => {
        syncingModelValueToBoard = false;
        console.warn('BDrawing model sync failed', error);
      });
  },
  { deep: true }
);

watch(
  () => [board.state.value.elements, board.state.value.edges, board.state.value.viewport],
  (): void => {
    if (props.modelValue === undefined || syncingModelValueToBoard) {
      return;
    }

    emit('update:modelValue', createDrawingDataSnapshot(board.state.value));
  },
  { deep: true }
);

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

/**
 * 文本节点编辑会话。
 */
interface TextEditingSession {
  /** 正在编辑的元素 ID */
  id: string;
  /** 进入编辑前的原始文本 */
  originalText: string;
  /** 是否为刚创建的文本节点 */
  isNew: boolean;
}

let directDragSession: DirectElementDragSession | null = null;
let handPanSession: HandPanSession | null = null;
let connectorDragSession: ConnectorDragSession | null = null;
let pendingTextElementCreateSession: PendingTextElementCreateSession | null = null;

/** 手型工具是否正在平移中。 */
const isPanning = ref<boolean>(false);
/** 创建连接线时当前 hover 的目标端点。 */
const connectorHoverEndpoint = ref<DrawingConnectorEndpoint | null>(null);
/** 当前文本编辑会话。 */
const textEditingSession = ref<TextEditingSession | null>(null);
/** 文本编辑输入值。 */
const textEditorValue = ref<string>('');
/** 文本编辑器 DOM。 */
const textEditorRef = ref<HTMLTextAreaElement | null>(null);

/** 可创建形状的工具列表 */
const SHAPE_TOOLS: readonly DrawingShapeType[] = ['process', 'rect', 'ellipse', 'diamond', 'text'];
/** 文本工具点击创建的最大拖动距离。 */
const TEXT_CREATE_CLICK_TOLERANCE = 4;
/** 文本工具点击已有元素后等待双击优先的延迟。 */
const TEXT_ELEMENT_CLICK_CREATE_DELAY = 220;
/** 文本编辑器与可视区边缘的最小间距。 */
const TEXT_EDITOR_VIEWPORT_MARGIN = 24;

/** 文本编辑框定位样式。 */
const textEditorStyle = computed<CSSProperties>(() => {
  const session = textEditingSession.value;
  const element = session ? findDrawingShapeElement(board.state.value.elements, session.id) : null;
  if (!element) {
    return {};
  }

  const { center, zoom } = board.state.value.viewport;
  const fontSize = element.style?.fontSize ?? DRAWING_TEXT_DEFAULT_FONT_SIZE;
  const fontWeight = element.style?.fontWeight ?? DRAWING_TEXT_DEFAULT_FONT_WEIGHT;
  const lineHeight = fontSize * DRAWING_TEXT_LINE_HEIGHT_RATIO;
  const size = measureDrawingTextElementSize(textEditorValue.value || element.text, element.style);
  const rootRect = rootRef.value?.getBoundingClientRect();
  const left = (rootRect?.left ?? 0) + viewportSize.value.width / 2 + (element.position.x - center.x) * zoom;
  const top = (rootRect?.top ?? 0) + viewportSize.value.height / 2 + (element.position.y - center.y) * zoom;

  return {
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    fontSize: `${fontSize * zoom}px`,
    fontWeight: String(fontWeight),
    height: `${size.height * zoom}px`,
    left: `${left}px`,
    lineHeight: `${lineHeight * zoom}px`,
    padding: `${(DRAWING_TEXT_VERTICAL_PADDING / 2) * zoom}px ${(DRAWING_TEXT_HORIZONTAL_PADDING / 2) * zoom}px`,
    position: 'fixed',
    textAlign: element.style?.textAlign ?? 'center',
    top: `${top}px`,
    whiteSpace: 'pre',
    width: `${size.width * zoom}px`
  };
});

/**
 * 从 ResizeObserver 条目读取画布尺寸。
 * @param entry - ResizeObserver 条目
 * @returns 画布尺寸，无法读取时返回 null
 */
function readResizeEntrySize(entry: ResizeObserverEntry): DrawingSize | null {
  const boxSize = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
  const width = boxSize?.inlineSize ?? entry.contentRect.width;
  const height = boxSize?.blockSize ?? entry.contentRect.height;
  if (!width || !height) {
    return null;
  }

  return { width, height };
}

/**
 * 从 DOM 读取根视口尺寸。
 * @returns 画布尺寸，无法读取时返回 null
 */
function readRootViewportSize(): DrawingSize | null {
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
 * 取消待执行的首屏稳定性检查。
 */
function cancelViewportReadyCheck(): void {
  if (viewportReadyFrame === null) {
    return;
  }

  cancelAnimationFrame(viewportReadyFrame);
  viewportReadyFrame = null;
}

/**
 * 取消待执行的视口尺寸同步。
 */
function cancelViewportSizeSync(): void {
  if (viewportSizeSyncFrame === null) {
    return;
  }

  cancelAnimationFrame(viewportSizeSyncFrame);
  viewportSizeSyncFrame = null;
}

/**
 * 等待根视口尺寸跨帧稳定后再显示 SVG。
 */
function scheduleViewportReadyCheck(): void {
  if (isViewportReady.value) {
    return;
  }

  cancelViewportReadyCheck();
  viewportReadyFrame = requestAnimationFrame((): void => {
    viewportReadyFrame = requestAnimationFrame((): void => {
      viewportReadyFrame = null;
      isViewportReady.value = true;
    });
  });
}

/**
 * 同步根视口尺寸。
 * @param size - 画布尺寸
 */
function setViewportSize(size: DrawingSize): void {
  viewportSize.value = size;
  scheduleViewportReadyCheck();
}

/**
 * 从根 DOM 同步视口尺寸。
 */
function syncViewportSizeFromRoot(): void {
  const size = readRootViewportSize();
  if (!size) {
    return;
  }

  setViewportSize(size);
}

/**
 * 在 KeepAlive 激活后的下一帧同步根视口尺寸。
 */
function scheduleViewportSizeSyncFromRoot(): void {
  cancelViewportSizeSync();
  isViewportReady.value = false;
  nextTick()
    .then((): void => {
      viewportSizeSyncFrame = requestAnimationFrame((): void => {
        viewportSizeSyncFrame = null;
        syncViewportSizeFromRoot();
      });
    })
    .catch((error: unknown): void => {
      console.warn('BDrawing viewport size sync failed', error);
    });
}

/**
 * 获取当前工具对应的创建形状。
 * @returns 可创建形状，不是形状工具时返回 null
 */
function getActiveCreateShape(): DrawingShapeType | null {
  return SHAPE_TOOLS.includes(activeTool.value as DrawingShapeType) ? (activeTool.value as DrawingShapeType) : null;
}

/** 当前激活的创建形状。 */
const activeCreateShape = computed<DrawingShapeType | null>(() => getActiveCreateShape());

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
  return viewportSize.value.width && viewportSize.value.height ? { ...viewportSize.value } : readRootViewportSize();
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
 * @param sourceId - 起点元素 ID
 * @returns 目标元素 ID
 */
function getConnectorTargetIdFromPointer(event: PointerEvent, sourceId: string): string | null {
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
function getConnectorEndpointFromPointer(id: string, event: PointerEvent): DrawingConnectorEndpoint | null {
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
 * 更新关联连接线的拖拽预览路径。
 * @param elementId - 正在预览变更的元素 ID
 * @param overrides - 预览几何覆盖
 */
function updateConnectedConnectorPreviews(elementId: string, overrides: DrawingConnectorPathElementOverride[]): void {
  const connectors = board.state.value.elements.filter(
    (element: DrawingElement): boolean =>
      isDrawingConnectorElement(element) && (element.source.elementId === elementId || element.target.elementId === elementId)
  );

  for (const connector of connectors) {
    if (!isDrawingConnectorElement(connector)) {
      continue;
    }

    const pathData = createDrawingConnectorPath(board.state.value.elements, connector, overrides);
    const markerStartPath = createDrawingConnectorMarkerPath(board.state.value.elements, connector, 'start', overrides);
    const markerEndPath = createDrawingConnectorMarkerPath(board.state.value.elements, connector, 'end', overrides);
    const targets = getElementTargetsById(connector.id);
    targets.forEach((target: Element): void => {
      const paths = target.querySelectorAll('.b-drawing-connector__line, .b-drawing-connector__hit');
      paths.forEach((path: Element): void => {
        path.setAttribute('d', pathData);
      });
      target.querySelector('.b-drawing-connector__marker-arrow--start')?.setAttribute('d', markerStartPath);
      target.querySelector('.b-drawing-connector__marker-arrow--end')?.setAttribute('d', markerEndPath);
    });
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
 * 结束当前文本编辑会话。
 */
function clearTextEditing(): void {
  textEditingSession.value = null;
  textEditorValue.value = '';
}

/**
 * 同步文本编辑器 DOM 内容。
 */
function syncTextEditorContent(): void {
  const editor = textEditorRef.value;
  if (!editor || editor.value === textEditorValue.value) {
    return;
  }

  editor.value = textEditorValue.value;
}

/**
 * 选中文本编辑器内的全部内容。
 */
function selectTextEditorContent(): void {
  const editor = textEditorRef.value;
  if (!editor) {
    return;
  }

  editor.select();
}

/**
 * 确保文本编辑器保持在画板可视区域内。
 */
function keepTextEditorInViewport(): void {
  const session = textEditingSession.value;
  const element = session ? findDrawingShapeElement(board.state.value.elements, session.id) : null;
  const rootRect = rootRef.value?.getBoundingClientRect();
  if (!element || !rootRect?.width || !rootRect.height) {
    return;
  }

  const { center, zoom } = board.state.value.viewport;
  const size = measureDrawingTextElementSize(textEditorValue.value || element.text, element.style);
  const editorLeft = rootRect.left + rootRect.width / 2 + (element.position.x - center.x) * zoom;
  const editorTop = rootRect.top + rootRect.height / 2 + (element.position.y - center.y) * zoom;
  const editorRight = editorLeft + size.width * zoom;
  const editorBottom = editorTop + size.height * zoom;
  const minLeft = rootRect.left + TEXT_EDITOR_VIEWPORT_MARGIN;
  const maxRight = rootRect.right - TEXT_EDITOR_VIEWPORT_MARGIN;
  const minTop = rootRect.top + TEXT_EDITOR_VIEWPORT_MARGIN;
  const maxBottom = rootRect.bottom - TEXT_EDITOR_VIEWPORT_MARGIN;
  let nextCenterX = center.x;
  let nextCenterY = center.y;

  if (editorLeft < minLeft) {
    nextCenterX += (editorLeft - minLeft) / zoom;
  }
  if (editorRight > maxRight) {
    nextCenterX += (editorRight - maxRight) / zoom;
  }
  if (editorTop < minTop) {
    nextCenterY += (editorTop - minTop) / zoom;
  }
  if (editorBottom > maxBottom) {
    nextCenterY += (editorBottom - maxBottom) / zoom;
  }

  if (nextCenterX === center.x && nextCenterY === center.y) {
    return;
  }

  viewport.setCenter({
    x: Number(nextCenterX.toFixed(2)),
    y: Number(nextCenterY.toFixed(2))
  });
}

/**
 * 在下一轮 DOM 更新后修正文本编辑器可见区域。
 */
function scheduleTextEditorViewportKeepAlive(): void {
  nextTick()
    .then((): void => {
      keepTextEditorInViewport();
    })
    .catch((error: unknown): void => {
      console.warn('BDrawing text editor viewport sync failed', error);
    });
}

/**
 * 开始编辑文本节点。
 * @param element - 文本元素
 * @param isNew - 是否为刚创建的元素
 */
async function startTextEditing(element: DrawingShapeElement, isNew: boolean): Promise<void> {
  textEditingSession.value = {
    id: element.id,
    originalText: element.text,
    isNew
  };
  textEditorValue.value = element.text;
  await nextTick();
  syncTextEditorContent();
  textEditorRef.value?.focus();
  selectTextEditorContent();
  scheduleTextEditorViewportKeepAlive();
}

/**
 * 在当前编辑光标处插入纯文本。
 * @param text - 要插入的文本
 */
function insertTextEditorPlainText(text: string): void {
  const editor = textEditorRef.value;
  if (!editor) {
    return;
  }

  const { selectionStart, selectionEnd } = editor;
  const nextValue = `${editor.value.slice(0, selectionStart)}${text}${editor.value.slice(selectionEnd)}`;
  const nextCaret = selectionStart + text.length;
  editor.value = nextValue;
  editor.setSelectionRange(nextCaret, nextCaret);
  textEditorValue.value = nextValue;
  scheduleTextEditorViewportKeepAlive();
}

/**
 * 提交文本编辑内容。
 */
function commitTextEditor(): void {
  const session = textEditingSession.value;
  if (!session) {
    return;
  }

  const nextText = textEditorValue.value;
  clearTextEditing();
  if (!nextText.trim()) {
    board.setSelection([session.id]);
    interaction.deleteSelection();
    return;
  }

  if (nextText !== session.originalText) {
    board.updateNodeText(session.id, nextText);
  }
}

/**
 * 取消文本编辑。
 */
function cancelTextEditor(): void {
  const session = textEditingSession.value;
  if (!session) {
    return;
  }

  clearTextEditing();
  if (session.isNew) {
    board.setSelection([session.id]);
    interaction.deleteSelection();
  }
}

/**
 * 处理文本编辑器输入。
 * @param event - 输入事件
 */
function handleTextEditorInput(event: Event): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }

  textEditorValue.value = target.value;
  scheduleTextEditorViewportKeepAlive();
}

/**
 * 处理文本编辑框快捷键。
 * @param event - 键盘事件
 */
function handleTextEditorKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelTextEditor();
    return;
  }

  if (event.key !== 'Enter') {
    return;
  }

  event.preventDefault();
  insertTextEditorPlainText('\n');
}

/**
 * 判断文本创建手势是否为点击。
 * @param start - 创建起点
 * @param end - 创建终点
 * @returns 是否为点击创建
 */
function isTextCreateClick(start: DrawingPoint, end: DrawingPoint): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) <= TEXT_CREATE_CLICK_TOLERANCE;
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
  }, TEXT_ELEMENT_CLICK_CREATE_DELAY);
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

  const targetId = getConnectorTargetIdFromPointer(event, connectorDragSession.source.elementId);
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
  const targetId = getConnectorTargetIdFromPointer(event, source.elementId);
  const target = targetId ? getConnectorEndpointFromPointer(targetId, event) : null;

  finishConnectorDrag(target);
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

  if (!connectorDragSession || connectorDragSession.source.elementId === id) {
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
  if (!element || isDrawingConnectorElement(element) || element.shape !== 'text') {
    return;
  }

  cancelDirectDrag();
  board.setSelection([id]);
  setActiveTool('select');
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
 * 判断键盘事件是否为画板全选快捷键。
 * @param event - 键盘事件
 * @returns 是否为全选快捷键
 */
function isSelectAllShortcut(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === 'a' && (event.metaKey || event.ctrlKey) && !event.altKey;
}

/**
 * 处理画板键盘快捷键。
 * @param event - 键盘事件
 */
function handleKeydown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  if (isKeyboardEventFromEditableTarget(event)) {
    return;
  }

  if (isSelectAllShortcut(event)) {
    event.preventDefault();
    board.setSelection(board.state.value.elements.map((element: DrawingElement): string => element.id));
    return;
  }

  if (key !== 'delete' && key !== 'backspace') {
    return;
  }

  event.preventDefault();
  interaction.deleteSelection();
}

onBeforeUnmount((): void => {
  cancelViewportSizeSync();
  cancelViewportReadyCheck();
  cancelHandPan();
  cancelDirectDrag();
  cancelConnectorDrag();
  cancelPendingTextElementCreate();
});

onMounted((): void => {
  syncViewportSizeFromRoot();
});

onActivated((): void => {
  scheduleViewportSizeSyncFromRoot();
});

useResizeObserver(rootRef, (entries: ResizeObserverEntry[]): void => {
  const size = entries[0] ? readResizeEntrySize(entries[0]) : null;
  if (!size) {
    return;
  }

  setViewportSize(size);
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

.b-drawing__text-editor {
  position: fixed;
  z-index: 20;
  box-sizing: border-box;
  overflow: hidden;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
  color: var(--text-primary);
  text-align: center;
  white-space: pre;
  resize: none;
  outline: none;
  background: transparent;
  border: none;
  border-radius: 6px;
  box-shadow: none;
}
</style>

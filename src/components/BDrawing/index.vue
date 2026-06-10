<!--
  @file index.vue
  @description 独立画图工具组件。
-->
<template>
  <section ref="rootRef" class="b-drawing" tabindex="0" @keydown="handleKeydown">
    <DrawingToolbar
      :zoom="board.state.value.viewport.zoom"
      :active-tool="activeTool"
      :can-undo="canUndo"
      :can-redo="canRedo"
      class="b-drawing__toolbar"
      @set-tool="setActiveTool"
      @undo="board.undo"
      @redo="board.redo"
      @zoom-in="viewport.zoomIn"
      @zoom-out="viewport.zoomOut"
    />
    <DrawingInfiniteViewport>
      <DrawingCanvas
        :elements="board.state.value.elements"
        :edges="board.state.value.edges"
        :selection="board.state.value.selection"
        :viewport="board.state.value.viewport"
        :viewport-size="viewportSize"
        :viewport-ready="isViewportReady"
        :active-tool="activeTool"
        :draft="board.state.value.draft"
        @select="handleElementSelect"
        @canvas-pointerdown="handleCanvasPointerdown"
        @canvas-pointermove="handleCanvasPointermove"
        @canvas-pointerup="handleCanvasPointerup"
        @canvas-wheel="handleCanvasWheel"
      />
    </DrawingInfiniteViewport>
    <DrawingMoveableLayer
      :enabled="activeTool === 'select' && !hideMoveableDuringDirectDrag"
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
import type { DrawingPoint, DrawingShapeElement, DrawingShapeType, DrawingSize, DrawingToolMode } from './types';
import type { DrawingCanvasPointProjection } from './utils/drawingGeometry';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import DrawingInfiniteViewport from './components/DrawingInfiniteViewport.vue';
import DrawingMoveableLayer from './components/DrawingMoveableLayer.vue';
import DrawingSelectoLayer from './components/DrawingSelectoLayer.vue';
import DrawingToolbar from './components/DrawingToolbar.vue';
import { useDrawingBoard } from './hooks/useDrawingBoard';
import { useDrawingInteraction } from './hooks/useDrawingInteraction';
import { useDrawingViewport } from './hooks/useDrawingViewport';
import DrawingCanvas from './renderers/DrawingCanvas.vue';
import {
  clientDeltaToDrawingDelta,
  createDrawingElementTransform,
  findDrawingShapeElement,
  projectClientPointToDrawingBoard,
  queryDrawingElementTarget
} from './utils/drawingGeometry';

const board = useDrawingBoard();
const viewport = useDrawingViewport(board);
const interaction = useDrawingInteraction(board);
const activeTool = ref<DrawingToolMode>('select');
const rootRef = ref<HTMLElement | null>(null);
/** 当前画布视口实际渲染尺寸。 */
const viewportSize = ref<DrawingSize>({ width: 0, height: 0 });
/** 画布首轮尺寸稳定后再显示 SVG，避免初始布局抖动产生黑框。 */
const isViewportReady = ref<boolean>(false);
let viewportReadyFrame: ReturnType<typeof requestAnimationFrame> | null = null;
/** 当前历史栈是否允许撤销。 */
const canUndo = computed<boolean>(() => board.state.value.history.past.length > 0);
/** 当前历史栈是否允许重做。 */
const canRedo = computed<boolean>(() => board.state.value.history.future.length > 0);
/** 未选中节点直接拖拽期间临时隐藏 Moveable 图层，避免旧选框跟随显示。 */
const hideMoveableDuringDirectDrag = ref<boolean>(false);

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

let directDragSession: DirectElementDragSession | null = null;
let handPanSession: HandPanSession | null = null;

/** 可创建形状的工具列表 */
const SHAPE_TOOLS: readonly DrawingShapeType[] = ['process', 'rect', 'ellipse', 'diamond', 'text'];

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
 * 获取当前工具对应的创建形状。
 * @returns 可创建形状，不是形状工具时返回 null
 */
function getActiveCreateShape(): DrawingShapeType | null {
  return SHAPE_TOOLS.includes(activeTool.value as DrawingShapeType) ? (activeTool.value as DrawingShapeType) : null;
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
 * 通过元素 ID 读取 SVG DOM 节点。
 * @param id - 元素 ID
 * @returns SVG DOM 节点
 */
function getElementTargetById(id: string): Element | null {
  return queryDrawingElementTarget(rootRef.value, id);
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
 * 创建 SVG 节点 transform 字符串。
 * @param position - 元素位置
 * @param session - 拖拽会话
 * @returns SVG transform
 */
function createDirectDragTransform(position: DrawingPoint, session: DirectElementDragSession): string {
  return createDrawingElementTransform(position, session.size, session.rotation);
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
 * 取消手型工具平移。
 */
function cancelHandPan(): void {
  handPanSession?.abortController.abort();
  handPanSession = null;
}

/**
 * 设置当前画板工具。
 * @param tool - 目标工具
 */
function setActiveTool(tool: DrawingToolMode): void {
  board.clearDraft();
  cancelHandPan();
  activeTool.value = tool;

  if (tool !== 'select') {
    board.setSelection([]);
  }
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
 * 处理元素点击。
 * @param id - 元素 ID
 * @param event - 指针事件
 */
function handleElementSelect(id: string, event: PointerEvent): void {
  if (activeTool.value !== 'connector') {
    if (board.state.value.selection.includes(id)) {
      return;
    }

    board.setSelection([]);
    startDirectDrag(id, event, true);
    return;
  }

  if (board.state.value.draft?.kind === 'creating-connector') {
    if (board.state.value.draft.sourceId === id) {
      board.clearDraft();
      return;
    }

    board.commitCreateConnectorDraft(id);
    setActiveTool('select');
    return;
  }

  board.startCreateConnectorDraft(id);
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
function handleCanvasPointerup(point: DrawingPoint): void {
  if (board.state.value.draft?.kind !== 'creating-shape') {
    return;
  }

  board.updateDraftPoint(point);
  board.commitCreateShapeDraft();
  setActiveTool('select');
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
 * 处理 Drawnix 风格基础快捷键。
 * @param event - 键盘事件
 */
function handleKeydown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();

  if ((event.metaKey || event.ctrlKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) {
      board.redo();
      return;
    }
    board.undo();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && key === 'y') {
    event.preventDefault();
    board.redo();
    return;
  }

  if (key === 'escape' || key === 'v') {
    event.preventDefault();
    setActiveTool('select');
    return;
  }

  if (key === 'h') {
    event.preventDefault();
    setActiveTool('hand');
    return;
  }

  if (key === 'p') {
    event.preventDefault();
    setActiveTool('process');
    return;
  }

  if (key === 'r') {
    event.preventDefault();
    setActiveTool('rect');
    return;
  }

  if (key === 'o') {
    event.preventDefault();
    setActiveTool('ellipse');
    return;
  }

  if (key === 'd') {
    event.preventDefault();
    setActiveTool('diamond');
    return;
  }

  if (key === 't') {
    event.preventDefault();
    setActiveTool('text');
    return;
  }

  if (key === 'c') {
    event.preventDefault();
    setActiveTool('connector');
    return;
  }

  if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    interaction.deleteSelection();
  }
}

onBeforeUnmount((): void => {
  cancelViewportReadyCheck();
  cancelHandPan();
  cancelDirectDrag();
});

onMounted((): void => {
  syncViewportSizeFromRoot();
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

/** 悬浮工具栏铺满画布，内部自行分组定位 */
.b-drawing__toolbar {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
}
</style>

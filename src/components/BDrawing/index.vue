<!--
  @file index.vue
  @description 独立画图工具组件。
-->
<template>
  <section ref="rootRef" class="b-drawing" tabindex="0" @keydown="handleKeydown">
    <DrawingToolbar
      :zoom="board.state.value.viewport.zoom"
      :active-tool="activeTool"
      class="b-drawing__toolbar"
      @set-tool="setActiveTool"
      @undo="board.undo"
      @redo="board.redo"
      @zoom-in="viewport.zoomIn"
      @zoom-out="viewport.zoomOut"
    />
    <DrawingCanvas
      :elements="board.state.value.elements"
      :edges="board.state.value.edges"
      :selection="board.state.value.selection"
      :viewport="board.state.value.viewport"
      :active-tool="activeTool"
      :draft="board.state.value.draft"
      @select="handleElementSelect"
      @canvas-pointerdown="handleCanvasPointerdown"
      @canvas-pointermove="handleCanvasPointermove"
      @canvas-pointerup="handleCanvasPointerup"
    />
    <DrawingMoveableLayer
      :enabled="activeTool === 'select' && !hideMoveableDuringDirectDrag"
      :root="rootRef"
      :elements="board.state.value.elements"
      :selection="board.state.value.selection"
      :viewport="board.state.value.viewport"
      @move="board.moveElements"
      @resize="board.resizeElements"
    />
    <DrawingSelectoLayer :root="rootRef" :active-tool="activeTool" :selection="board.state.value.selection" @set-selection="board.setSelection" />
  </section>
</template>

<script setup lang="ts">
import type { DrawingPoint, DrawingShapeElement, DrawingShapeType, DrawingToolMode } from './types';
import { onBeforeUnmount, ref } from 'vue';
import DrawingMoveableLayer from './components/DrawingMoveableLayer.vue';
import DrawingSelectoLayer from './components/DrawingSelectoLayer.vue';
import DrawingToolbar from './components/DrawingToolbar.vue';
import { useDrawingBoard } from './hooks/useDrawingBoard';
import { useDrawingInteraction } from './hooks/useDrawingInteraction';
import { useDrawingViewport } from './hooks/useDrawingViewport';
import DrawingCanvas from './renderers/DrawingCanvas.vue';

const board = useDrawingBoard();
const viewport = useDrawingViewport(board);
const interaction = useDrawingInteraction(board);
const activeTool = ref<DrawingToolMode>('select');
const rootRef = ref<HTMLElement | null>(null);
/** 未选中节点直接拖拽期间临时隐藏 Moveable 图层，避免旧选框跟随显示。 */
const hideMoveableDuringDirectDrag = ref<boolean>(false);
const DEFAULT_VIEWBOX_WIDTH = 1200;
const DEFAULT_VIEWBOX_HEIGHT = 720;

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
  size: DrawingShapeElement['size'];
  /** 起始旋转角度 */
  rotation: number;
  /** 是否已经产生位移 */
  moved: boolean;
  /** 是否在拖拽结束后选中元素 */
  selectOnEnd: boolean;
  /** 拖拽监听取消器 */
  abortController: AbortController;
}

let directDragSession: DirectElementDragSession | null = null;

/**
 * 设置当前画板工具。
 * @param tool - 目标工具
 */
function setActiveTool(tool: DrawingToolMode): void {
  board.clearDraft();
  activeTool.value = tool;

  if (tool !== 'select') {
    board.setSelection([]);
  }
}

/**
 * 获取当前工具对应的创建形状。
 * @returns 可创建形状，不是形状工具时返回 null
 */
function getActiveCreateShape(): DrawingShapeType | null {
  if (
    activeTool.value === 'process' ||
    activeTool.value === 'rect' ||
    activeTool.value === 'ellipse' ||
    activeTool.value === 'diamond' ||
    activeTool.value === 'text'
  ) {
    return activeTool.value;
  }

  return null;
}

/**
 * 通过元素 ID 读取形状元素。
 * @param id - 元素 ID
 * @returns 形状元素
 */
function getShapeElementById(id: string): DrawingShapeElement | null {
  const element = board.state.value.elements.find((item) => item.id === id);
  return element?.kind === 'shape' ? element : null;
}

/**
 * 通过元素 ID 读取 SVG DOM 节点。
 * @param id - 元素 ID
 * @returns SVG DOM 节点
 */
function getElementTargetById(id: string): Element | null {
  return rootRef.value?.querySelector(`[data-drawing-element-id="${id}"]`) ?? null;
}

/**
 * 读取画布 DOM 元素。
 * @returns 画布 DOM 元素
 */
function getCanvasElement(): HTMLElement | null {
  return rootRef.value?.querySelector<HTMLElement>('.b-drawing-canvas') ?? null;
}

/**
 * 将浏览器指针位置转换为画板坐标。
 * @param event - 指针事件
 * @returns 画板坐标，无法读取画布尺寸时返回 null
 */
function getBoardPointFromPointer(event: PointerEvent): DrawingPoint | null {
  const rect = getCanvasElement()?.getBoundingClientRect();
  if (!rect?.width || !rect.height) {
    return null;
  }

  const currentViewport = board.state.value.viewport;
  const viewBoxWidth = DEFAULT_VIEWBOX_WIDTH / currentViewport.zoom;
  const viewBoxHeight = DEFAULT_VIEWBOX_HEIGHT / currentViewport.zoom;
  const xRatio = (event.clientX - rect.left) / rect.width;
  const yRatio = (event.clientY - rect.top) / rect.height;

  return {
    x: currentViewport.center.x - viewBoxWidth / 2 + xRatio * viewBoxWidth,
    y: currentViewport.center.y - viewBoxHeight / 2 + yRatio * viewBoxHeight
  };
}

/**
 * 创建 SVG 节点 transform 字符串。
 * @param position - 元素位置
 * @param session - 拖拽会话
 * @returns SVG transform
 */
function createDirectDragTransform(position: DrawingPoint, session: DirectElementDragSession): string {
  if (!session.rotation) {
    return `translate(${position.x}, ${position.y})`;
  }

  return `translate(${position.x}, ${position.y}) rotate(${session.rotation}, ${session.size.width / 2}, ${session.size.height / 2})`;
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
function handleCanvasPointerdown(point: DrawingPoint): void {
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
  cancelDirectDrag();
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
  border: 1px solid var(--border-primary);
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

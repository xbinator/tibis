<!--
  @file index.vue
  @description 独立画图工具组件。
-->
<template>
  <section ref="rootRef" class="b-drawing" tabindex="0">
    <InfiniteViewport>
      <DrawingCanvas
        :elements="board.state.value.elements"
        :selection="board.state.value.selection"
        :geometry-preview-changes="moveablePreviewChanges"
        :viewport="board.state.value.viewport"
        :viewport-size="viewportSize"
        :viewport-ready="isViewportReady"
        :active-tool="activeTool"
        :is-panning="isPanning"
        @select="handleElementSelect"
        @element-pointerup="handleElementPointerup"
        @canvas-pointerdown="handleCanvasPointerdown"
        @canvas-pointermove="handleCanvasPointermove"
        @canvas-pointerup="handleCanvasPointerup"
        @canvas-wheel="handleCanvasWheel"
      />
    </InfiniteViewport>
    <MoveableLayer
      :enabled="activeTool === 'select' && !hideMoveableDuringDirectDrag"
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
import type { DrawingData, DrawingElement, DrawingElementStyle, DrawingGeometryChange, DrawingPoint, DrawingShapeElement, DrawingSize } from './types';
import type { DrawingCanvasPointProjection } from './utils/drawingGeometry';
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue';
import { useShortcuts } from '@/hooks/useShortcuts';
import InfiniteViewport from './components/InfiniteViewport.vue';
import MoveableLayer from './components/MoveableLayer.vue';
import SelectoLayer from './components/SelectoLayer.vue';
import Toolbar from './components/Toolbar.vue';
import { DRAWING_SHAPE_TOOLS, DRAWING_TEXT_CREATE_CLICK_TOLERANCE } from './constants/interaction';
import { getDrawingElementSchema } from './elements';
import { useDrawingBoard } from './hooks/useDrawingBoard';
import { useDrawingInteraction } from './hooks/useDrawingInteraction';
import { useDrawingViewport } from './hooks/useDrawingViewport';
import { useModelSync } from './hooks/useModelSync';
import { useViewportSize } from './hooks/useViewportSize';
import DrawingCanvas from './renderers/DrawingCanvas.vue';
import {
  clientDeltaToDrawingDelta,
  createDrawingElementCssTransform,
  createDrawingViewportForElements,
  findDrawingShapeElement,
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
  /** 通知外部当前内部选区 */
  'selection-change': [selection: string[]];
}>();

const board = useDrawingBoard(props.modelValue);
const viewport = useDrawingViewport(board);
const interaction = useDrawingInteraction(board);
const activeTool = ref<string>('select');
/** 创建工具激活时应用到下一个形状的样式。 */
const creationStyle = ref<DrawingElementStyle>({});
const { rootRef, viewportSize, isViewportReady } = useViewportSize();
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

watch(
  () => board.state.value.selection,
  (selection: string[]): void => {
    emit('selection-change', [...selection]);
  },
  { immediate: true }
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

/** 手型工具是否正在平移中。 */
const isPanning = ref<boolean>(false);

/**
 * 获取当前工具对应的创建元素名称。
 * @returns 可创建元素名称，不是创建工具时返回 null
 */
function getActiveCreateName(): string | null {
  return DRAWING_SHAPE_TOOLS.includes(activeTool.value) ? activeTool.value : null;
}

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
 * 通过元素 ID 读取 HTML DOM 节点。
 * @param id - 元素 ID
 * @returns HTML DOM 节点
 */
function getElementTargetById(id: string): Element | null {
  return queryDrawingElementTarget(rootRef.value, id);
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
 * 将浏览器坐标转换为画板坐标。
 * @param clientX - 浏览器横坐标
 * @param clientY - 浏览器纵坐标
 * @returns 画板坐标，无法读取画布尺寸时返回 null
 */
function getBoardPointFromClient(clientX: number, clientY: number): DrawingPoint | null {
  return getCanvasPointProjection(clientX, clientY)?.boardPoint ?? null;
}

/**
 * 将浏览器指针位置转换为画板坐标。
 * @param event - 指针事件
 * @returns 画板坐标，无法读取画布尺寸时返回 null
 */
function getBoardPointFromPointer(event: PointerEvent): DrawingPoint | null {
  return getBoardPointFromClient(event.clientX, event.clientY);
}

/**
 * 创建 HTML 节点 transform 字符串。
 * @param position - 元素位置
 * @param session - 拖拽会话
 * @returns CSS transform
 */
function createDirectDragTransform(position: DrawingPoint, session: DirectElementDragSession): string {
  return createDrawingElementCssTransform(position, session.rotation);
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
function setActiveTool(tool: string): void {
  board.clearDraft();
  cancelHandPan();
  activeTool.value = tool;

  if (tool !== 'select') {
    board.setSelection([]);
  }
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
 * 在指定画板坐标创建元素。
 * @param name - 元素注册名称
 * @param point - 创建位置
 */
function createElementAtPoint(name: string, point: DrawingPoint): void {
  board.startCreateShapeDraft(name, point);
  board.updateDraftPoint(point);
  board.commitCreateShapeDraft(creationStyle.value);
  setActiveTool('select');
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
  if (target instanceof HTMLElement) {
    target.style.transform = createDirectDragTransform(position, directDragSession);
  }
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
 * 处理元素上释放指针。
 */
function handleElementPointerup(): void {
  handleDirectDragEnd();
}

/**
 * 处理元素点击。
 * @param id - 元素 ID
 * @param _event - 指针事件
 */
function handleElementSelect(id: string, _event: PointerEvent): void {
  if (activeTool.value === 'hand') {
    return;
  }

  if (activeTool.value === 'text') {
    return;
  }

  /* 形状创建工具（rect/ellipse/diamond/text/process）激活时，禁止选中已有节点，让点击穿透到画布创建形状 */
  if (getActiveCreateName()) {
    return;
  }

  if (board.state.value.selection.includes(id)) {
    return;
  }

  board.setSelection([]);
  startDirectDrag(id, _event, true);
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

  const name = getActiveCreateName();
  if (name) {
    board.startCreateShapeDraft(name, point);
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
  const { draft } = board.state.value;
  if (draft?.kind !== 'creating-shape') {
    return;
  }

  if (draft.name === 'text' && !isTextCreateClick(draft.start, point)) {
    board.clearDraft();
    return;
  }

  board.updateDraftPoint(point);
  board.commitCreateShapeDraft(creationStyle.value);
  setActiveTool('select');
}

/**
 * 根据注册元素和浏览器坐标创建画图元素。
 * @param name - 元素注册名称
 * @param clientPoint - 浏览器坐标
 */
async function createElementFromClientPoint(name: string, clientPoint: DrawingPoint): Promise<void> {
  const schema = getDrawingElementSchema(name);
  if (!schema) {
    return;
  }

  cancelDirectDrag();
  board.clearDraft();
  const point = getBoardPointFromClient(clientPoint.x, clientPoint.y);
  if (!point) {
    return;
  }

  createElementAtPoint(schema.name, point);
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
});

defineExpose({
  createElementFromClientPoint
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
}
</style>

<!--
  @file index.vue
  @description 独立Widget工具组件。
-->
<template>
  <section ref="rootRef" class="b-widget" tabindex="0">
    <InfiniteViewport>
      <WidgetCanvas
        :elements="board.state.value.elements"
        :selection="board.state.value.selection"
        :active-element-id="activeElementId"
        :geometry-preview-changes="moveablePreviewChanges"
        :viewport="board.state.value.viewport"
        :viewport-size="viewportSize"
        :viewport-ready="isViewportReady"
        :active-tool="activeTool"
        :create-cursor="activeCreateCursor"
        :is-create-tool="isCreateToolActive"
        :is-panning="isPanning"
        @select="handleElementSelect"
        @element-pointerup="handleElementPointerup"
        @canvas-pointerdown="handleCanvasPointerdown"
        @canvas-pointermove="handleCanvasPointermove"
        @canvas-pointerup="handleCanvasPointerup"
        @canvas-wheel="handleCanvasWheel"
        @context-menu="handleWidgetContextMenu"
      />
    </InfiniteViewport>
    <MoveableLayer
      :enabled="activeTool === 'select' && !hideMoveableDuringDirectDrag"
      :root="rootRef"
      :elements="board.state.value.elements"
      :selection="board.state.value.selection"
      :active-element-id="activeElementId"
      :viewport="board.state.value.viewport"
      :viewport-size="viewportSize"
      @context-menu="handleWidgetContextMenu"
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
      @set-selection="setBoardSelection"
    />
    <WidgetContextMenu
      :open="contextMenuState.open"
      :position="contextMenuState.clientPoint"
      :items="contextMenuItems"
      @select="handleContextMenuCommand"
      @close="closeContextMenu"
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
import type { WidgetElementSchema } from './elements';
import type {
  WidgetData,
  WidgetContextMenuPayload,
  WidgetElement,
  WidgetElementStyle,
  WidgetGeometryChange,
  WidgetLayerAction,
  WidgetPoint,
  WidgetSelectTarget,
  WidgetShapeElement,
  WidgetSize
} from './types';
import type { WidgetCanvasPointProjection } from './utils/widgetGeometry';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useShortcuts } from '@/hooks/useShortcuts';
import WidgetContextMenu from './components/ContextMenu.vue';
import InfiniteViewport from './components/InfiniteViewport.vue';
import MoveableLayer from './components/MoveableLayer.vue';
import SelectoLayer from './components/SelectoLayer.vue';
import Toolbar from './components/Toolbar.vue';
import { getWidgetElementSchema } from './elements';
import { useWidgetBoard } from './hooks/useWidgetBoard';
import { useWidgetInteraction } from './hooks/useWidgetInteraction';
import { useWidgetViewport } from './hooks/useWidgetViewport';
import { useModelSync } from './hooks/useModelSync';
import { provideRenderContext } from './hooks/useRenderContext';
import { useViewportSize } from './hooks/useViewportSize';
import WidgetCanvas from './renderers/WidgetCanvas.vue';
import { createDefaultWidgetData } from './utils/widgetData';
import {
  clientDeltaToWidgetDelta,
  createWidgetElementCssTransform,
  createWidgetViewportForElements,
  findWidgetShapeElement,
  projectClientPointToWidgetBoard,
  queryWidgetElementTarget
} from './utils/widgetGeometry';
import { expandWidgetSelectionToGroups, hasWidgetGroupedSelection } from './utils/widgetGroups';
import { readWidgetPreviewRenderContext } from './utils/widgetPreviewContext';

/**
 * 右键菜单命令。
 */
type WidgetContextMenuCommand = 'copy' | 'paste' | 'group' | 'ungroup' | 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack' | 'delete';

/**
 * 右键菜单项。
 */
interface WidgetContextMenuItem {
  /** 菜单项类型 */
  type?: 'item';
  /** 菜单命令 */
  key: WidgetContextMenuCommand;
  /** 展示文案 */
  label: string;
  /** 图标 */
  icon: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否危险操作 */
  danger?: boolean;
}

/**
 * 右键菜单分割线。
 */
interface WidgetContextMenuDivider {
  /** 菜单项类型 */
  type: 'divider';
  /** 分割线唯一标识 */
  key: string;
}

/**
 * 右键菜单条目。
 */
type WidgetContextMenuEntry = WidgetContextMenuItem | WidgetContextMenuDivider;

/**
 * 右键菜单状态。
 */
interface WidgetContextMenuState {
  /** 是否打开 */
  open: boolean;
  /** 右键命中的元素 ID */
  elementId: string | null;
  /** 浏览器坐标 */
  clientPoint: WidgetPoint;
  /** Widget坐标 */
  boardPoint: WidgetPoint;
}

/**
 * 根据元素 ID 选中元素的配置。
 */
interface SelectElementByIdOptions {
  /** 组合选区内是否将该元素作为当前编辑子元素 */
  activateElement?: boolean;
}

const dataItem = defineModel<WidgetData>('value', {
  default: createDefaultWidgetData
});
/** 当前选中的绘图目标（元素或锚点），支持双向绑定。 */
const selectedTarget = defineModel<WidgetSelectTarget>('select', { default: null });
const emit = defineEmits<{
  /** 同步内部选区 ID 列表 */
  'selection-change': [selection: string[]];
}>();
/** Widget实例，管理绘图元素数据与状态。 */
const board = useWidgetBoard(dataItem.value);
/** 当前Widget数据内声明的预览渲染上下文。 */
const renderContext = computed(() => readWidgetPreviewRenderContext(dataItem.value.metadata));
provideRenderContext(renderContext);
/** 视口控制器，处理Widget的平移与缩放。 */
const viewport = useWidgetViewport(board);
/** 交互控制器，处理鼠标/触控事件与元素操作。 */
const interaction = useWidgetInteraction(board);
/** 当前激活的工具名称，默认为选择工具。 */
const activeTool = ref<string>('select');
/** 组合选区内当前作为设置面板编辑目标的子元素 ID。 */
const activeElementId = ref<string | null>(null);
/** 创建工具激活时应用到下一个形状的样式。 */
const creationStyle = ref<WidgetElementStyle>({});
const { rootRef, viewportSize, isViewportReady } = useViewportSize();
useModelSync({ board, dataItem });
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
const moveablePreviewChanges = ref<WidgetGeometryChange[]>([]);
/** 右键菜单状态。 */
const contextMenuState = ref<WidgetContextMenuState>({
  open: false,
  elementId: null,
  clientPoint: { x: 0, y: 0 },
  boardPoint: { x: 0, y: 0 }
});
/** 当前激活工具对应的可创建元素配置。 */
const activeCreateSchema = computed<WidgetElementSchema | null>(() => getWidgetElementSchema(activeTool.value));
/** 当前是否激活可创建元素工具。 */
const isCreateToolActive = computed<boolean>(() => activeCreateSchema.value !== null);
/** 当前创建工具光标。 */
const activeCreateCursor = computed<string | undefined>(() => (activeCreateSchema.value ? activeCreateSchema.value.createCursor ?? 'crosshair' : undefined));
/** 当前右键菜单项。 */
const contextMenuItems = computed<WidgetContextMenuEntry[]>(() => {
  const hasSelection = board.state.value.selection.length > 0;
  const canGroup = board.state.value.selection.length > 1;
  const canUngroup = hasWidgetGroupedSelection(board.state.value.elements, board.state.value.selection);
  const groupEntries: WidgetContextMenuEntry[] = [];

  if (canUngroup) {
    groupEntries.push({ type: 'divider', key: 'divider-edit-group' }, { key: 'ungroup', label: '取消合并', icon: 'lucide:ungroup' });
  } else if (canGroup) {
    groupEntries.push({ type: 'divider', key: 'divider-edit-group' }, { key: 'group', label: '合并', icon: 'lucide:group' });
  }

  return [
    { key: 'copy', label: '复制', icon: 'lucide:copy', disabled: !hasSelection },
    { key: 'paste', label: '粘贴', icon: 'lucide:clipboard-paste', disabled: !board.hasClipboard.value },
    ...groupEntries,
    { type: 'divider', key: 'divider-group-layer' },
    { key: 'bringForward', label: '上一层', icon: 'lucide:bring-to-front', disabled: !hasSelection },
    { key: 'sendBackward', label: '下一层', icon: 'lucide:send-to-back', disabled: !hasSelection },
    { key: 'bringToFront', label: '置顶', icon: 'lucide:chevrons-up', disabled: !hasSelection },
    { key: 'sendToBack', label: '置底', icon: 'lucide:chevrons-down', disabled: !hasSelection },
    { type: 'divider', key: 'divider-layer-danger' },
    { key: 'delete', label: '删除', icon: 'lucide:trash-2', disabled: !hasSelection, danger: true }
  ];
});
/**
 * 根据内部选区创建外部可编辑目标。
 * @param selection - 内部选区 ID 列表
 * @returns 外部可编辑目标
 */
function createSelectedTargetFromSelection(selection: string[]): WidgetSelectTarget {
  if (selection.length === 0) return dataItem.value.metadata;

  if (activeElementId.value && selection.includes(activeElementId.value)) {
    const activeElement = dataItem.value.elements.find((item: WidgetElement): boolean => item.id === activeElementId.value);

    if (activeElement) {
      return activeElement;
    }
  }

  if (selection.length > 1) return null;

  const selectedId = selection[0];
  const element = dataItem.value.elements.find((item: WidgetElement): boolean => item.id === selectedId);

  return element ?? dataItem.value.metadata;
}

/**
 * 判断两个选区是否一致。
 * @param current - 当前选区
 * @param next - 目标选区
 * @returns 是否一致
 */
function isSameSelection(current: string[], next: string[]): boolean {
  return current.length === next.length && current.every((id: string, index: number): boolean => id === next[index]);
}

/**
 * 判断当前激活子元素是否仍然对应一个完整组合选区。
 * @param selection - 内部选区 ID 列表
 * @returns 激活子元素是否有效
 */
function isActiveElementSelection(selection: string[]): boolean {
  if (!activeElementId.value || !selection.includes(activeElementId.value)) {
    return false;
  }

  const activeGroupSelection = expandWidgetSelectionToGroups(dataItem.value.elements, [activeElementId.value]);

  return activeGroupSelection.length > 1 && isSameSelection(selection, activeGroupSelection);
}

/**
 * 同步组合子元素激活态，避免激活 ID 脱离当前选区。
 * @param selection - 内部选区 ID 列表
 */
function syncActiveElementId(selection: string[]): void {
  if (activeElementId.value && !isActiveElementSelection(selection)) {
    activeElementId.value = null;
  }
}

/**
 * 处理内部选区变化。
 * @param selection - 内部选区 ID 列表
 */
function handleSelectionChange(selection: string[]): void {
  syncActiveElementId(selection);
  selectedTarget.value = createSelectedTargetFromSelection(selection);
  emit('selection-change', [...selection]);
}

/**
 * 按组合关系扩展并设置选区。
 * @param selection - 原始选区
 */
function setBoardSelection(selection: string[]): void {
  activeElementId.value = null;
  board.setSelection(expandWidgetSelectionToGroups(board.state.value.elements, selection));
}

/**
 * 读取元素点击后应使用的选区。
 * @param id - 元素 ID
 * @returns 展开组合后的选区
 */
function getSelectionForElement(id: string): string[] {
  return expandWidgetSelectionToGroups(board.state.value.elements, [id]);
}

/**
 * 读取元素右键菜单应使用的选区。
 * @param id - 元素 ID
 * @returns 右键菜单选区
 */
function getContextMenuSelectionForElement(id: string): string[] {
  if (board.state.value.selection.includes(id)) {
    return expandWidgetSelectionToGroups(board.state.value.elements, board.state.value.selection);
  }

  return getSelectionForElement(id);
}

/**
 * 关闭右键菜单。
 */
function closeContextMenu(): void {
  contextMenuState.value = {
    ...contextMenuState.value,
    open: false
  };
}

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

  const nextViewport = createWidgetViewportForElements(board.state.value.elements, viewportSize.value);
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

watch(() => board.state.value.selection, handleSelectionChange, { immediate: true });

/**
 * 直接拖拽节点会话。
 */
interface DirectElementDragSession {
  /** 拖拽元素 ID */
  id: string;
  /** 起始浏览器坐标 */
  startClient: WidgetPoint;
  /** 起始Widget坐标 */
  startBoard: WidgetPoint | null;
  /** 起始元素位置 */
  startPosition: WidgetPoint;
  /** 最后一次预览位置 */
  currentPosition: WidgetPoint;
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
  startClient: WidgetPoint;
  /** 起始视口中心 */
  startCenter: WidgetPoint;
  /** 起始缩放比例 */
  startZoom: number;
  /** 起始Widget渲染尺寸 */
  canvasSize: WidgetSize;
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
  return activeCreateSchema.value?.name ?? null;
}

/**
 * 处理 Moveable 缩放预览。
 * @param changes - 预览几何变更
 */
function handleMoveableResizePreview(changes: WidgetGeometryChange[]): void {
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
function handleMoveableResize(changes: WidgetGeometryChange[]): void {
  board.resizeElements(changes);
  handleMoveablePreviewEnd();
}

/**
 * 通过元素 ID 读取形状元素。
 * @param id - 元素 ID
 * @returns 形状元素
 */
function getShapeElementById(id: string): WidgetShapeElement | null {
  return findWidgetShapeElement(board.state.value.elements, id);
}

/**
 * 通过元素 ID 读取 HTML DOM 节点。
 * @param id - 元素 ID
 * @returns HTML DOM 节点
 */
function getElementTargetById(id: string): Element | null {
  return queryWidgetElementTarget(rootRef.value, id);
}

/**
 * 读取Widget渲染尺寸。
 * @returns Widget渲染尺寸，无法读取时返回 null
 */
function getCanvasSize(): WidgetSize | null {
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
 * 将浏览器坐标投影到Widget坐标系。
 * @param clientX - 浏览器横坐标
 * @param clientY - 浏览器纵坐标
 * @returns Widget投影信息，无法读取Widget尺寸时返回 null
 */
function getCanvasPointProjection(clientX: number, clientY: number): WidgetCanvasPointProjection | null {
  const rect = rootRef.value?.getBoundingClientRect();
  if (!rect) {
    return null;
  }

  return projectClientPointToWidgetBoard({ x: clientX, y: clientY }, rect, board.state.value.viewport);
}

/**
 * 将浏览器坐标转换为Widget坐标。
 * @param clientX - 浏览器横坐标
 * @param clientY - 浏览器纵坐标
 * @returns Widget坐标，无法读取Widget尺寸时返回 null
 */
function getBoardPointFromClient(clientX: number, clientY: number): WidgetPoint | null {
  return getCanvasPointProjection(clientX, clientY)?.boardPoint ?? null;
}

/**
 * 将浏览器指针位置转换为Widget坐标。
 * @param event - 指针事件
 * @returns Widget坐标，无法读取Widget尺寸时返回 null
 */
function getBoardPointFromPointer(event: PointerEvent): WidgetPoint | null {
  return getBoardPointFromClient(event.clientX, event.clientY);
}

/**
 * 创建 HTML 节点 transform 字符串。
 * @param position - 元素位置
 * @param session - 拖拽会话
 * @returns CSS transform
 */
function createDirectDragTransform(position: WidgetPoint, session: DirectElementDragSession): string {
  return createWidgetElementCssTransform(position, session.rotation);
}

/**
 * 根据浏览器坐标计算直接拖拽位置。
 * @param event - 指针事件
 * @param session - 拖拽会话
 * @returns 新位置
 */
function getDirectDragPosition(event: PointerEvent, session: DirectElementDragSession): WidgetPoint {
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
 * 设置当前Widget工具。
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
 * 打开Widget右键菜单。
 * @param payload - 右键菜单事件载荷
 */
function handleWidgetContextMenu(payload: WidgetContextMenuPayload): void {
  cancelDirectDrag();
  setActiveTool('select');

  if (payload.elementId) {
    const selection = getContextMenuSelectionForElement(payload.elementId);
    if (!isSameSelection(board.state.value.selection, selection)) {
      board.setSelection(selection);
    }
  } else {
    board.setSelection([]);
  }

  contextMenuState.value = {
    open: true,
    elementId: payload.elementId,
    clientPoint: payload.clientPoint,
    boardPoint: payload.boardPoint
  };
}

/**
 * 处理右键菜单命令。
 * @param command - 菜单命令
 */
function handleContextMenuCommand(command: string): void {
  switch (command) {
    case 'copy': {
      board.copySelection();
      break;
    }
    case 'paste': {
      board.pasteClipboard(contextMenuState.value.boardPoint);
      break;
    }
    case 'group': {
      board.groupSelection();
      break;
    }
    case 'ungroup': {
      board.ungroupSelection();
      break;
    }
    case 'bringToFront': {
      board.reorderSelection('bringToFront');
      break;
    }
    case 'bringForward': {
      board.reorderSelection('bringForward');
      break;
    }
    case 'sendBackward': {
      board.reorderSelection('sendBackward');
      break;
    }
    case 'sendToBack': {
      board.reorderSelection('sendToBack');
      break;
    }
    case 'delete': {
      board.deleteSelection();
      break;
    }
    default: {
      break;
    }
  }

  closeContextMenu();
}

/**
 * 在指定Widget坐标创建元素。
 * @param name - 元素注册名称
 * @param point - 创建位置
 */
function createElementAtPoint(name: string, point: WidgetPoint): void {
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

  const delta = clientDeltaToWidgetDelta(
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
function handleElementSelect(id: string, event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  if (activeTool.value === 'hand') {
    return;
  }

  /* 元素创建工具激活时，禁止选中已有节点，让点击穿透到Widget创建元素 */
  if (getActiveCreateName()) {
    return;
  }

  const selection = getSelectionForElement(id);
  if (isSameSelection(board.state.value.selection, selection)) {
    if (selection.length > 1 && activeElementId.value !== id) {
      activeElementId.value = id;
      selectedTarget.value = createSelectedTargetFromSelection(selection);
    }

    return;
  }

  activeElementId.value = selection.length > 1 ? id : null;
  board.setSelection(selection);
  if (selection.length === 1) {
    startDirectDrag(id, event, true);
  }
}

/**
 * 处理Widget空白区域按下。
 * @param point - Widget坐标
 */
function handleCanvasPointerdown(point: WidgetPoint, event: PointerEvent): void {
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
 * 处理Widget空白区域移动。
 * @param point - Widget坐标
 */
function handleCanvasPointermove(point: WidgetPoint): void {
  board.updateDraftPoint(point);
}

/**
 * 处理Widget空白区域抬起。
 * @param point - Widget坐标
 */
function handleCanvasPointerup(point: WidgetPoint): void {
  const { draft } = board.state.value;
  if (draft?.kind !== 'creating-shape') {
    return;
  }

  board.updateDraftPoint(point);
  board.commitCreateShapeDraft(creationStyle.value);
  setActiveTool('select');
}

/**
 * 根据注册元素和浏览器坐标创建Widget元素。
 * @param name - 元素注册名称
 * @param clientPoint - 浏览器坐标
 */
async function createElementFromClientPoint(name: string, clientPoint: WidgetPoint): Promise<void> {
  const schema = getWidgetElementSchema(name);
  if (!schema) return;

  cancelDirectDrag();
  board.clearDraft();
  const point = getBoardPointFromClient(clientPoint.x, clientPoint.y);
  if (!point) return;

  createElementAtPoint(schema.name, point);
}

/**
 * 根据元素 ID 选中Widget元素。
 * @param id - 元素 ID
 * @param options - 选中配置
 */
function selectElementById(id: string, options: SelectElementByIdOptions = {}): void {
  const hasElement = board.state.value.elements.some((element: WidgetElement): boolean => element.id === id);
  if (!hasElement) {
    return;
  }

  cancelDirectDrag();
  setActiveTool('select');
  const selection = getSelectionForElement(id);
  activeElementId.value = options.activateElement && selection.length > 1 ? id : null;
  board.setSelection(selection);
}

/**
 * 根据元素 ID 列表选中Widget元素。
 * @param ids - 元素 ID 列表
 */
function selectElementsByIds(ids: string[]): void {
  const elementIds = new Set(board.state.value.elements.map((element: WidgetElement): string => element.id));
  const selection = ids.filter((id: string): boolean => elementIds.has(id));
  if (selection.length === 0) {
    return;
  }

  cancelDirectDrag();
  setActiveTool('select');
  activeElementId.value = null;
  board.setSelection(expandWidgetSelectionToGroups(board.state.value.elements, selection));
}

/**
 * 复制当前Widget选区。
 */
function copySelection(): void {
  board.copySelection();
}

/**
 * 合并当前Widget选区。
 */
function groupSelection(): void {
  board.groupSelection();
}

/**
 * 取消当前Widget选区中的组合。
 */
function ungroupSelection(): void {
  board.ungroupSelection();
}

/**
 * 删除当前Widget选区。
 */
function deleteSelection(): void {
  board.deleteSelection();
}

/**
 * 调整当前Widget选区层级。
 * @param action - 层级操作
 */
function reorderSelection(action: WidgetLayerAction): void {
  board.reorderSelection(action);
}

/**
 * 处理Widget滚轮缩放。
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
 * 判断Widget局部快捷键是否可响应当前键盘事件。
 * @param event - 键盘事件
 * @returns 是否允许响应Widget快捷键
 */
function canHandleWidgetShortcut(event: KeyboardEvent): boolean {
  const { target } = event;

  return target instanceof Element && rootRef.value?.contains(target) === true && !isKeyboardEventFromEditableTarget(event);
}

/**
 * 选中Widget中的全部元素。
 */
function selectAllWidgetElements(): void {
  board.setSelection(board.state.value.elements.map((element: WidgetElement): string => element.id));
}

/**
 * 注册Widget键盘快捷键。
 * @returns 取消快捷键注册的函数
 */
function registerWidgetKeyboardShortcuts(): () => void {
  return registerShortcuts([
    {
      key: 'Ctrl+Z',
      handler: board.undo,
      guard: canHandleWidgetShortcut
    },
    {
      key: 'Ctrl+Shift+Z',
      handler: board.redo,
      guard: canHandleWidgetShortcut
    },
    {
      key: 'Ctrl+Y',
      handler: board.redo,
      guard: canHandleWidgetShortcut
    },
    {
      key: 'Ctrl+A',
      handler: selectAllWidgetElements,
      guard: canHandleWidgetShortcut
    },
    {
      key: 'Delete',
      handler: interaction.deleteSelection,
      guard: canHandleWidgetShortcut
    },
    {
      key: 'Backspace',
      handler: interaction.deleteSelection,
      guard: canHandleWidgetShortcut
    }
  ]);
}

const unregisterWidgetKeyboardShortcuts = registerWidgetKeyboardShortcuts();

onBeforeUnmount((): void => {
  unregisterWidgetKeyboardShortcuts();
  cancelHandPan();
  cancelDirectDrag();
});

defineExpose({
  createElementFromClientPoint,
  selectElementById,
  selectElementsByIds,
  copySelection,
  groupSelection,
  ungroupSelection,
  deleteSelection,
  reorderSelection
});
</script>

<style lang="less" scoped>
.b-widget {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  outline: none;
}
</style>

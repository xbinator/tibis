<!--
  @file MoveableLayer.vue
  @description BWidget Moveable 控制器适配层。
-->
<template>
  <div
    v-if="shouldShowMoveableLayer"
    class="b-widget-moveable-layer"
    @contextmenu.stop.prevent="handleContextMenu"
    @pointerdown.stop
    @pointermove.stop
    @pointerup.stop
  >
    <VueMoveable
      ref="moveableRef"
      :target="targets"
      :container="root"
      :root-container="root"
      :use-accurate-position="true"
      :draggable="true"
      :resizable="canResizeSelection"
      :snappable="canSnapSelection"
      :snap-center="true"
      :snap-gap="canSnapSelection"
      :snap-threshold="WIDGET_MOVEABLE_SNAP_THRESHOLD"
      :snap-render-threshold="WIDGET_MOVEABLE_SNAP_THRESHOLD"
      :snap-directions="WIDGET_MOVEABLE_SNAP_DIRECTIONS"
      :element-snap-directions="WIDGET_MOVEABLE_SNAP_DIRECTIONS"
      :element-guidelines="activeGuidelineTargets"
      :hide-child-moveable-default-lines="shouldHideChildMoveableDefaultLines"
      :padding="moveableSelectionPadding"
      :render-directions="WIDGET_MOVEABLE_RENDER_DIRECTIONS"
      :zoom="viewport.zoom"
      :origin="false"
      :throttle-drag="WIDGET_MOVEABLE_THROTTLE"
      :throttle-resize="WIDGET_MOVEABLE_THROTTLE"
      @drag-start="handleDragStart"
      @drag="handleDrag"
      @drag-end="handleDragEnd"
      @drag-group-start="handleDragGroupStart"
      @drag-group="handleDragGroup"
      @drag-group-end="handleDragGroupEnd"
      @resize-start="handleResizeStart"
      @resize="handleResize"
      @resize-end="handleResizeEnd"
      @resize-group-start="handleResizeGroupStart"
      @resize-group="handleResizeGroup"
      @resize-group-end="handleResizeGroupEnd"
    />
    <VueMoveable
      v-if="activeChildTarget"
      ref="activeChildMoveableRef"
      class-name="b-widget-moveable-layer__active-child"
      :target="activeChildTarget"
      :container="root"
      :root-container="root"
      :use-accurate-position="true"
      :draggable="false"
      :resizable="false"
      :snappable="false"
      :hide-default-lines="false"
      :padding="disabledMoveableSelectionPadding"
      :render-directions="[]"
      :zoom="viewport.zoom"
      :origin="false"
    />
  </div>
</template>

<script setup lang="ts">
import type { WidgetContextMenuPayload, WidgetElement, WidgetGeometryChange, WidgetPoint, WidgetSize, WidgetViewport } from '../types';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import VueMoveable from 'vue3-moveable/dist/moveable.js';
import {
  WIDGET_MOVEABLE_RENDER_DIRECTIONS,
  WIDGET_MOVEABLE_SELECTION_PADDING,
  WIDGET_MOVEABLE_SNAP_DIRECTIONS,
  WIDGET_MOVEABLE_SNAP_THRESHOLD,
  WIDGET_MOVEABLE_THROTTLE
} from '../constants/interaction';
import { getWidgetElementSchema } from '../elements';
import { useRenderContext } from '../hooks/useRenderContext';
import {
  createWidgetElementCssTransform,
  getWidgetElementId,
  getWidgetShapeRenderSize,
  projectClientPointToWidgetBoard,
  queryWidgetElementTarget
} from '../utils/widgetGeometry';

/**
 * Moveable 结束事件中的 DOM target。
 */
interface MoveableTargetEvent {
  /** 操作目标 */
  target?: Element;
}

/**
 * Moveable 二维向量。
 */
type MoveableVector = [number, number];

/**
 * Moveable 拖动过程事件。
 */
interface MoveableDragEvent extends MoveableTargetEvent {
  /** Moveable 拖拽总位移 */
  dist?: MoveableVector;
  /** Moveable 兼容平移量，部分测试替身仍按增量传入 */
  translate?: MoveableVector;
}

/**
 * Moveable 拖动结束事件。
 */
interface MoveableDragEndEvent extends MoveableTargetEvent {
  /** 最后一帧拖动事件 */
  lastEvent?: MoveableDragEvent;
}

/**
 * Moveable 缩放尺寸数据。
 */
interface MoveableResizePayload {
  /** Moveable 宽度 */
  width?: number;
  /** Moveable 高度 */
  height?: number;
  /** 缩放方向 */
  direction?: [number, number];
  /** 缩放期间的拖动补偿 */
  drag?: {
    /** Moveable 平移量 */
    beforeTranslate?: [number, number];
  };
}

/**
 * Moveable 缩放开始事件。
 */
interface MoveableResizeStartEvent extends MoveableTargetEvent {
  /** 设置 Moveable 缩放开始尺寸 */
  set?: (size: MoveableVector) => void;
}

/**
 * Moveable 缩放结束事件。
 */
interface MoveableResizeEndEvent extends MoveableTargetEvent {
  /** Moveable 宽度 */
  width?: number;
  /** Moveable 高度 */
  height?: number;
  /** 缩放期间的拖动补偿 */
  drag?: {
    /** Moveable 平移量 */
    beforeTranslate?: [number, number];
  };
  /** Moveable resizeEnd 携带的最后一帧缩放数据 */
  lastEvent?: MoveableResizePayload;
}

/**
 * Moveable 缩放过程事件。
 */
type MoveableResizeEvent = MoveableResizeEndEvent;

/**
 * Moveable 多目标事件。
 */
interface MoveableGroupEvent<TEvent extends MoveableTargetEvent> {
  /** 每个子目标对应的 Moveable 事件 */
  events?: TEvent[];
}

/**
 * Moveable 图层入参。
 */
interface Props {
  /** Widget根节点 */
  root: HTMLElement | null;
  /** 元素列表 */
  elements: WidgetElement[];
  /** 当前选区 */
  selection: string[];
  /** 组合选区内当前编辑的子元素 ID */
  activeElementId?: string | null;
  /** 当前视口 */
  viewport: WidgetViewport;
  /** 当前视口渲染尺寸 */
  viewportSize: WidgetSize;
  /** 是否启用控制器 */
  enabled: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 提交移动变更 */
  move: [changes: WidgetGeometryChange[]];
  /** 打开右键菜单 */
  'context-menu': [payload: WidgetContextMenuPayload];
  /** 清理临时几何预览 */
  'preview-end': [];
  /** 提交缩放变更 */
  resize: [changes: WidgetGeometryChange[]];
  /** 提交缩放过程预览 */
  'resize-preview': [changes: WidgetGeometryChange[]];
}>();
/** 当前Widget渲染上下文，用于文本绑定内容的尺寸测量。 */
const renderContext = useRenderContext();

/**
 * Moveable 组件公开实例。
 */
interface MoveableInstance {
  /** 重新计算控制框位置 */
  updateRect: () => void;
}

/**
 * Moveable 控制间距配置。
 */
interface MoveableSelectionPadding {
  /** 下侧留白 */
  bottom: number;
  /** 左侧留白 */
  left: number;
  /** 右侧留白 */
  right: number;
  /** 上侧留白 */
  top: number;
}

const targets = ref<Element[]>([]);
const moveableRef = ref<MoveableInstance | null>(null);
const activeChildMoveableRef = ref<MoveableInstance | null>(null);
let moveableRectRefreshFrame: ReturnType<typeof requestAnimationFrame> | null = null;
/** 单选拖拽时用于元素间吸附的其它Widget节点。 */
const guidelineTargets = ref<Element[]>([]);
/** 不展示 Moveable 控制间距时使用的零留白配置。 */
const disabledMoveableSelectionPadding: MoveableSelectionPadding = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0
};
const singleTarget = computed<boolean>(() => targets.value.length === 1);
/** 是否展示 Moveable 控制层。 */
const shouldShowMoveableLayer = computed<boolean>(() => props.enabled && targets.value.length > 0);
/** 是否隐藏组合子目标默认线，避免非当前子元素也呈现激活框。 */
const shouldHideChildMoveableDefaultLines = computed<boolean>(() => Boolean(props.activeElementId) && targets.value.length > 1);
/**
 * 通过 DOM target 读取元素 ID。
 * @param target - Moveable 操作目标
 * @returns 元素 ID
 */
function getTargetId(target?: Element): string | null {
  return getWidgetElementId(target);
}

/**
 * 通过元素 ID 读取业务元素。
 * @param id - 元素 ID
 * @returns 业务元素
 */
function getElementById(id: string): WidgetElement | undefined {
  return props.elements.find((element) => element.id === id);
}

/**
 * 读取当前选区可用于右键菜单的锚点元素。
 * @returns 当前选区中的首个有效元素 ID
 */
function getContextMenuAnchorElementId(): string | null {
  const elementIds = new Set(props.elements.map((element: WidgetElement): string => element.id));

  return props.selection.find((id: string): boolean => elementIds.has(id)) ?? null;
}

/**
 * 将浏览器指针位置转换为Widget坐标。
 * @param event - 鼠标事件
 * @returns Widget坐标
 */
function getBoardPointFromClient(event: MouseEvent): WidgetPoint {
  const rect = props.root?.getBoundingClientRect();
  if (!rect) {
    return { ...props.viewport.center };
  }

  const projection = projectClientPointToWidgetBoard({ x: event.clientX, y: event.clientY }, rect, props.viewport);

  return projection?.boardPoint ?? { ...props.viewport.center };
}

/**
 * 创建 Moveable 控制层右键菜单载荷。
 * @param event - 鼠标事件
 * @returns 右键菜单载荷
 */
function createContextMenuPayload(event: MouseEvent): WidgetContextMenuPayload {
  return {
    elementId: getContextMenuAnchorElementId(),
    clientPoint: { x: event.clientX, y: event.clientY },
    boardPoint: getBoardPointFromClient(event)
  };
}

/**
 * 处理 Moveable 控制层右键菜单。
 * @param event - 鼠标事件
 */
function handleContextMenu(event: MouseEvent): void {
  emit('context-menu', createContextMenuPayload(event));
}

/**
 * 判断元素是否允许通过 Moveable 修改尺寸。
 * @param element - Widget元素
 * @returns 是否允许缩放
 */
function isElementResizable(element: WidgetElement): boolean {
  return getWidgetElementSchema(element.name)?.resize?.enabled ?? true;
}

/**
 * 按元素 schema 归一化缩放后的尺寸。
 * @param element - Widget元素
 * @param size - Moveable 请求尺寸
 * @returns 可写入模型的尺寸
 */
function normalizeResizeSize(element: WidgetElement, size: WidgetSize): WidgetSize {
  return getWidgetShapeRenderSize(
    {
      ...element,
      size
    },
    renderContext.value
  );
}

/** 当前选中的Widget元素。 */
const selectedElements = computed<WidgetElement[]>(() =>
  props.selection.map(getElementById).filter((element: WidgetElement | undefined): element is WidgetElement => element !== undefined)
);
/** 当前选区是否允许通过 Moveable 修改尺寸。 */
const canResizeSelection = computed<boolean>(() => selectedElements.value.every((element: WidgetElement): boolean => isElementResizable(element)));
/** 当前选区是否允许展示 Moveable 吸附辅助线。 */
const canSnapSelection = computed<boolean>(() => singleTarget.value && selectedElements.value.length === 1);
/** 当前选区使用的 Moveable 控制间距。 */
const moveableSelectionPadding = computed<MoveableSelectionPadding>(() =>
  canResizeSelection.value ? WIDGET_MOVEABLE_SELECTION_PADDING : disabledMoveableSelectionPadding
);
/** 当前实际传给 Moveable 的吸附参考节点。 */
const activeGuidelineTargets = computed<Element[]>(() => (canSnapSelection.value ? guidelineTargets.value : []));
/** 当前组合内正在编辑的子元素 Moveable target。 */
const activeChildTarget = computed<Element | null>(() => {
  if (!props.activeElementId || targets.value.length <= 1) {
    return null;
  }

  return targets.value.find((target: Element): boolean => getTargetId(target) === props.activeElementId) ?? null;
});

/**
 * 通过元素 ID 读取 DOM target。
 * @param id - 元素 ID
 * @returns DOM target
 */
function getTargetById(id: string): Element | null {
  return queryWidgetElementTarget(props.root, id);
}

/**
 * 立即刷新 Moveable 控制框位置。
 */
function refreshMoveableRect(): void {
  if (!props.enabled || !targets.value.length) {
    return;
  }

  moveableRef.value?.updateRect();
  activeChildMoveableRef.value?.updateRect();
}

/**
 * 在拖拽预览帧中刷新组合内当前子元素控制框。
 */
function refreshActiveChildMoveableRect(): void {
  activeChildMoveableRef.value?.updateRect();
}

/**
 * 取消已排队的 Moveable 控制框刷新。
 */
function cancelMoveableRectRefresh(): void {
  if (moveableRectRefreshFrame === null) {
    return;
  }

  cancelAnimationFrame(moveableRectRefreshFrame);
  moveableRectRefreshFrame = null;
}

/**
 * 将 Moveable 控制框刷新排到下一帧，等待 HTML 舞台完成布局。
 */
function scheduleMoveableRectRefresh(): void {
  if (!props.enabled || !targets.value.length || moveableRectRefreshFrame !== null) {
    return;
  }

  moveableRectRefreshFrame = requestAnimationFrame((): void => {
    moveableRectRefreshFrame = null;
    refreshMoveableRect();
  });
}

/**
 * Moveable 事件值转换为Widget坐标值。
 * @param value - Moveable 事件值
 * @returns Widget坐标值
 */
function moveableValueToWorld(value: number): number {
  return value;
}

/**
 * 创建 HTML 节点 transform 字符串。
 * @param element - Widget元素
 * @param distance - Moveable 拖拽总位移
 * @returns CSS transform
 */
function createPreviewTransform(element: WidgetElement, distance: MoveableVector): string {
  return createWidgetElementCssTransform(
    {
      x: element.position.x + moveableValueToWorld(distance[0]),
      y: element.position.y + moveableValueToWorld(distance[1])
    },
    element.rotation
  );
}

/**
 * 读取 Moveable 拖拽总位移。
 * @param event - Moveable 拖拽事件
 * @returns 拖拽总位移
 */
function getMoveableDragDistance(event: MoveableDragEvent | undefined): MoveableVector | null {
  if (!event) {
    return null;
  }

  return event.dist ?? event.translate ?? null;
}

/**
 * 将 Moveable 多选缩放尺寸转换为Widget坐标尺寸。
 * @param size - Moveable 事件中的尺寸
 * @returns Widget坐标尺寸
 */
function groupResizeSizeToWorld(size: WidgetSize): WidgetSize {
  return {
    width: moveableValueToWorld(size.width),
    height: moveableValueToWorld(size.height)
  };
}

/**
 * 更新 HTML 节点的预览尺寸。
 * @param target - HTML 元素目标
 * @param size - 预览尺寸
 */
function updateNodePreviewSize(target: Element, size: WidgetSize): void {
  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.style.width = `${size.width}px`;
  target.style.height = `${size.height}px`;
}

/**
 * 将 Moveable 操作目标恢复到当前 schema 渲染尺寸。
 * @param event - Moveable 目标事件
 */
function syncTargetRenderSize(event: MoveableTargetEvent): void {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  if (!event.target || !element) {
    return;
  }

  updateNodePreviewSize(event.target, getWidgetShapeRenderSize(element, renderContext.value));
}

/**
 * 将 Moveable 缩放开始尺寸对齐到当前 schema 渲染尺寸。
 * @param event - Moveable 缩放开始事件
 */
function setResizeStartSize(event: MoveableResizeStartEvent): void {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  if (!element || !isElementResizable(element) || !event.set) {
    return;
  }

  const renderSize = getWidgetShapeRenderSize(element, renderContext.value);
  event.set([renderSize.width, renderSize.height]);
}

/**
 * 立即完成控制框刷新。
 */
function flushMoveableRectRefresh(): void {
  cancelMoveableRectRefresh();
  refreshMoveableRect();
}

/**
 * 从拖拽结束事件创建几何移动变更。
 * @param event - Moveable 拖拽结束事件
 * @returns 几何变更，事件不完整时返回 null
 */
function createMoveChange(event: MoveableDragEndEvent): WidgetGeometryChange | null {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  const distance = getMoveableDragDistance(event.lastEvent);
  if (!id || !element || !distance) {
    return null;
  }

  return {
    id,
    position: {
      x: element.position.x + moveableValueToWorld(distance[0]),
      y: element.position.y + moveableValueToWorld(distance[1])
    }
  };
}

/**
 * 读取 Moveable 缩放事件中的最后有效尺寸。
 * @param event - Moveable 缩放或缩放结束事件
 * @returns 缩放尺寸数据
 */
function getResizePayload(event: MoveableResizeEndEvent): MoveableResizePayload {
  return event.lastEvent ?? event;
}

/**
 * 从缩放结束事件创建几何尺寸变更。
 * @param event - Moveable 缩放结束事件
 * @param shouldConvertGroupSize - 是否按多选缩放路径转换尺寸
 * @returns 几何变更，事件不完整时返回 null
 */
function createResizeChange(event: MoveableResizeEndEvent, shouldConvertGroupSize = false): WidgetGeometryChange | null {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  const payload = getResizePayload(event);
  if (!id || !element || !isElementResizable(element) || payload.width === undefined || payload.height === undefined) {
    return null;
  }

  const translate = payload.drag?.beforeTranslate ?? [0, 0];
  const requestedSize = shouldConvertGroupSize
    ? groupResizeSizeToWorld({ width: payload.width, height: payload.height })
    : { width: payload.width, height: payload.height };
  const size = normalizeResizeSize(element, requestedSize);
  return {
    id,
    position: {
      x: element.position.x + moveableValueToWorld(translate[0]),
      y: element.position.y + moveableValueToWorld(translate[1])
    },
    size
  };
}

/**
 * 预览 Moveable 拖动并返回几何预览变更。
 * @param event - Moveable 拖动过程事件
 * @returns 预览几何变更，事件不完整时返回 null
 */
function previewDragEvent(event: MoveableDragEvent): WidgetGeometryChange | null {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  const distance = getMoveableDragDistance(event);
  if (!event.target || !id || !element || !distance) {
    return null;
  }

  const position = {
    x: element.position.x + moveableValueToWorld(distance[0]),
    y: element.position.y + moveableValueToWorld(distance[1])
  };
  if (event.target instanceof HTMLElement) {
    event.target.style.transform = createPreviewTransform(element, distance);
  }

  return {
    id,
    position
  };
}

/**
 * 预览 Moveable 缩放并返回几何预览变更。
 * @param event - Moveable 缩放过程事件
 * @param shouldConvertGroupSize - 是否按多选缩放路径转换尺寸
 * @returns 预览几何变更，事件不完整时返回 null
 */
function previewResizeEvent(event: MoveableResizeEvent, shouldConvertGroupSize = false): WidgetGeometryChange | null {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  if (!event.target || !id || !element || !isElementResizable(element) || event.width === undefined || event.height === undefined) {
    return null;
  }

  const translate = event.drag?.beforeTranslate ?? [0, 0];
  const requestedSize = shouldConvertGroupSize
    ? groupResizeSizeToWorld({ width: event.width, height: event.height })
    : { width: event.width, height: event.height };
  const position = {
    x: element.position.x + moveableValueToWorld(translate[0]),
    y: element.position.y + moveableValueToWorld(translate[1])
  };

  // 预览阶段保留 Moveable 原始尺寸，避免文本内容自适应高度反向影响拖拽帧。
  const size = requestedSize;
  if (event.target instanceof HTMLElement) {
    event.target.style.transform = createPreviewTransform(element, translate);
  }
  updateNodePreviewSize(event.target, size);

  return {
    id,
    position,
    size
  };
}

/**
 * 读取选区对应 DOM target。
 */
async function syncTargets(): Promise<void> {
  await nextTick();
  if (!props.root || !props.enabled) {
    targets.value = [];
    guidelineTargets.value = [];
    return;
  }

  const shapeIds = new Set<string>(props.elements.map((element) => element.id));
  const selectedTargets = props.selection
    .filter((id: string): boolean => shapeIds.has(id))
    .map(getTargetById)
    .filter((target): target is Element => target !== null);
  const selectedIds = new Set<string>(props.selection);

  targets.value = selectedTargets;
  guidelineTargets.value =
    selectedTargets.length === 1
      ? props.elements
          .filter((element: WidgetElement): boolean => !selectedIds.has(element.id))
          .map((element: WidgetElement): Element | null => getTargetById(element.id))
          .filter((target): target is Element => target !== null)
      : [];
  await nextTick();
  refreshMoveableRect();
}

/**
 * 处理 Moveable 拖动开始。
 * @param event - Moveable 拖动开始事件
 */
function handleDragStart(event: MoveableTargetEvent): void {
  syncTargetRenderSize(event);
  flushMoveableRectRefresh();
}

/**
 * 处理 Moveable 拖动过程。
 * @param event - Moveable 拖动过程事件
 */
function handleDrag(event: MoveableDragEvent): void {
  previewDragEvent(event);
}

/**
 * 处理 Moveable 缩放开始。
 * @param event - Moveable 缩放开始事件
 */
function handleResizeStart(event: MoveableResizeStartEvent): void {
  flushMoveableRectRefresh();
  setResizeStartSize(event);
}

/**
 * 处理 Moveable 缩放过程。
 * @param event - Moveable 缩放过程事件
 * @param shouldConvertGroupSize - 是否按多选缩放路径转换尺寸
 */
function handleResize(event: MoveableResizeEvent, shouldConvertGroupSize = false): void {
  const change = previewResizeEvent(event, shouldConvertGroupSize);
  if (!change) {
    return;
  }

  emit('resize-preview', [change]);
}

/**
 * 处理 Moveable 拖拽结束。
 * @param event - Moveable 拖拽结束事件
 */
function handleDragEnd(event: MoveableDragEndEvent): void {
  const change = createMoveChange(event);
  if (!change) {
    return;
  }

  emit('move', [change]);
}

/**
 * 处理 Moveable 多目标拖动开始。
 * @param event - Moveable 多目标拖动开始事件
 */
function handleDragGroupStart(event: MoveableGroupEvent<MoveableTargetEvent>): void {
  event.events?.forEach(syncTargetRenderSize);
  flushMoveableRectRefresh();
}

/**
 * 处理 Moveable 多目标拖动过程。
 * @param event - Moveable 多目标拖动过程事件
 */
function handleDragGroup(event: MoveableGroupEvent<MoveableDragEvent>): void {
  event.events?.forEach((dragEvent: MoveableDragEvent): void => {
    previewDragEvent(dragEvent);
  });
  refreshActiveChildMoveableRect();
}

/**
 * 处理 Moveable 多目标拖拽结束。
 * @param event - Moveable 多目标拖拽结束事件
 */
function handleDragGroupEnd(event: MoveableGroupEvent<MoveableDragEndEvent>): void {
  const changes = event.events?.map(createMoveChange).filter((change): change is WidgetGeometryChange => change !== null) ?? [];
  if (!changes.length) {
    return;
  }

  emit('move', changes);
}

/**
 * 处理 Moveable 多目标缩放开始。
 * @param event - Moveable 多目标缩放开始事件
 */
function handleResizeGroupStart(event: MoveableGroupEvent<MoveableResizeStartEvent>): void {
  flushMoveableRectRefresh();
  event.events?.forEach(setResizeStartSize);
}

/**
 * 处理 Moveable 缩放结束。
 * @param event - Moveable 缩放结束事件
 */
function handleResizeEnd(event: MoveableResizeEndEvent): void {
  const change = createResizeChange(event);
  if (!change) {
    emit('preview-end');
    return;
  }

  emit('resize', [change]);
  emit('preview-end');
}

/**
 * 处理 Moveable 多目标缩放过程。
 * @param event - Moveable 多目标缩放过程事件
 */
function handleResizeGroup(event: MoveableGroupEvent<MoveableResizeEvent>): void {
  const changes =
    event.events
      ?.map((resizeEvent: MoveableResizeEvent): WidgetGeometryChange | null => previewResizeEvent(resizeEvent, true))
      .filter((change): change is WidgetGeometryChange => change !== null) ?? [];
  if (!changes.length) {
    return;
  }

  refreshActiveChildMoveableRect();
  emit('resize-preview', changes);
}

/**
 * 处理 Moveable 多目标缩放结束。
 * @param event - Moveable 多目标缩放结束事件
 */
function handleResizeGroupEnd(event: MoveableGroupEvent<MoveableResizeEndEvent>): void {
  const changes =
    event.events
      ?.map((resizeEvent: MoveableResizeEndEvent): WidgetGeometryChange | null => createResizeChange(resizeEvent, true))
      .filter((change): change is WidgetGeometryChange => change !== null) ?? [];
  if (!changes.length) {
    emit('preview-end');
    return;
  }

  emit('resize', changes);
  emit('preview-end');
}

onMounted(() => {
  syncTargets().catch((error: unknown): void => {
    console.warn('BWidget Moveable target sync failed', error);
  });
});

onBeforeUnmount(() => {
  cancelMoveableRectRefresh();
});

watch(
  () => [props.root, props.selection, props.elements, props.enabled],
  () => {
    syncTargets().catch((error: unknown): void => {
      console.warn('BWidget Moveable target sync failed', error);
    });
  },
  { deep: true }
);

watch(
  () => [props.viewport.center.x, props.viewport.center.y, props.viewport.zoom, props.viewportSize.width, props.viewportSize.height],
  () => {
    scheduleMoveableRectRefresh();
  },
  { flush: 'post' }
);
</script>

<style lang="less" scoped>
.b-widget-moveable-layer {
  --moveable-control-padding: 12;

  position: absolute;
  inset: 0;
  pointer-events: none;

  :deep(.moveable-control) {
    width: 8px !important;
    height: 8px !important;
    margin-top: -4px !important;
    margin-left: -4px !important;
    background: #fff !important;
    border: 1px solid var(--color-primary) !important;
    border-radius: 0 !important;
  }

  :deep(.moveable-control-box) {
    z-index: 1;
    pointer-events: auto;
  }

  :deep(.moveable-control:hover) {
    background: var(--color-primary-hover) !important;
    border-color: var(--bg-primary) !important;
    box-shadow: 0 0 0 4px var(--color-primary-bg-hover), 0 6px 14px var(--color-control-outline) !important;
  }

  :deep(.moveable-line) {
    background: var(--color-primary) !important;
    box-shadow: none;
  }

  :deep(.moveable-line.moveable-dashed) {
    box-shadow: none;
  }

  :deep(.moveable-line.moveable-horizontal.moveable-dashed) {
    border-top-color: var(--color-primary);
  }

  :deep(.moveable-line.moveable-vertical.moveable-dashed) {
    border-left-color: var(--color-primary);
  }

  :deep(.b-widget-moveable-layer__active-child) {
    z-index: 2;
    pointer-events: none;
  }

  :deep(.b-widget-moveable-layer__active-child .moveable-line) {
    box-shadow: none;
  }

  :deep(.moveable-guideline) {
    background: var(--color-primary-hover);
    box-shadow: 0 0 0 1px var(--color-primary-bg);
  }

  :deep(.moveable-guideline-group .moveable-size-value),
  :deep(.guideline-group .size-value) {
    min-width: max-content;
    padding: 3px 6px;
    font-size: 11px;
    font-weight: 650;
    line-height: 1;
    color: var(--color-primary);
    text-align: center;
    white-space: nowrap;
    background: var(--bg-primary);
    border: 1px solid var(--color-primary-border);
    border-radius: 999px;
    box-shadow: var(--shadow-sm);
  }

  :deep(.moveable-size-value.moveable-gap),
  :deep(.size-value.gap) {
    color: var(--color-primary);
  }

  :deep(.moveable-size-value:empty),
  :deep(.size-value:empty) {
    display: none !important;
  }
}
</style>

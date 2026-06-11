<!--
  @file DrawingMoveableLayer.vue
  @description BDrawing Moveable 控制器适配层。
-->
<template>
  <div v-if="enabled && targets.length" class="b-drawing-moveable-layer">
    <VueMoveable
      ref="moveableRef"
      :target="targets"
      :draggable="true"
      :resizable="true"
      :snappable="singleTarget"
      :snap-center="true"
      :snap-gap="true"
      :snap-threshold="5"
      :snap-render-threshold="5"
      :snap-directions="snapDirections"
      :element-snap-directions="snapDirections"
      :element-guidelines="guidelineTargets"
      :zoom="viewport.zoom"
      :origin="false"
      :throttle-drag="0"
      :throttle-resize="0"
      @drag="handleDrag"
      @drag-end="handleDragEnd"
      @drag-group="handleDragGroup"
      @drag-group-end="handleDragGroupEnd"
      @resize="handleResize"
      @resize-end="handleResizeEnd"
      @resize-group="handleResizeGroup"
      @resize-group-end="handleResizeGroupEnd"
    />
  </div>
</template>

<script setup lang="ts">
import type { DrawingElement, DrawingGeometryChange, DrawingSize, DrawingViewport } from '../types';
import type { SnapDirections } from 'moveable';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import VueMoveable from 'vue3-moveable/dist/moveable.js';
import {
  createDrawingDiamondPoints,
  createDrawingElementTransform,
  getDrawingElementId,
  isDrawingDiamondShape,
  queryDrawingElementTarget
} from '../utils/drawingGeometry';

/**
 * Moveable 结束事件中的 DOM target。
 */
interface MoveableTargetEvent {
  /** 操作目标 */
  target?: Element;
}

/**
 * Moveable 拖动结束事件。
 */
interface MoveableDragEndEvent extends MoveableTargetEvent {
  /** 最后一帧拖动事件 */
  lastEvent?: {
    /** DOM 坐标平移量 */
    translate?: [number, number];
  };
}

/**
 * Moveable 拖动过程事件。
 */
interface MoveableDragEvent extends MoveableTargetEvent {
  /** DOM 坐标平移量 */
  translate?: [number, number];
}

/**
 * Moveable 缩放尺寸数据。
 */
interface MoveableResizePayload {
  /** DOM 宽度 */
  width?: number;
  /** DOM 高度 */
  height?: number;
  /** 缩放期间的拖动补偿 */
  drag?: {
    /** DOM 坐标平移量 */
    beforeTranslate?: [number, number];
  };
}

/**
 * Moveable 缩放结束事件。
 */
interface MoveableResizeEndEvent extends MoveableTargetEvent {
  /** DOM 宽度 */
  width?: number;
  /** DOM 高度 */
  height?: number;
  /** 缩放期间的拖动补偿 */
  drag?: {
    /** DOM 坐标平移量 */
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
  /** 画板根节点 */
  root: HTMLElement | null;
  /** 元素列表 */
  elements: DrawingElement[];
  /** 当前选区 */
  selection: string[];
  /** 当前视口 */
  viewport: DrawingViewport;
  /** 当前视口渲染尺寸 */
  viewportSize: DrawingSize;
  /** 是否启用控制器 */
  enabled: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 提交移动变更 */
  move: [changes: DrawingGeometryChange[]];
  /** 提交缩放变更 */
  resize: [changes: DrawingGeometryChange[]];
}>();

/**
 * Moveable 组件公开实例。
 */
interface MoveableInstance {
  /** 重新计算控制框位置 */
  updateRect: () => void;
}

const targets = ref<Element[]>([]);
const moveableRef = ref<MoveableInstance | null>(null);
/** 单选拖拽时用于元素间吸附的其它画板节点。 */
const guidelineTargets = ref<Element[]>([]);
const singleTarget = computed<boolean>(() => targets.value.length === 1);
/** Moveable 元素吸附方向，显式包含中心线和中线。 */
const snapDirections: SnapDirections = {
  bottom: true,
  center: true,
  left: true,
  middle: true,
  right: true,
  top: true
};

/**
 * 通过 DOM target 读取元素 ID。
 * @param target - Moveable 操作目标
 * @returns 元素 ID
 */
function getTargetId(target?: Element): string | null {
  return getDrawingElementId(target);
}

/**
 * 通过元素 ID 读取业务元素。
 * @param id - 元素 ID
 * @returns 业务元素
 */
function getElementById(id: string): DrawingElement | undefined {
  return props.elements.find((element) => element.id === id);
}

/**
 * 通过元素 ID 读取 DOM target。
 * @param id - 元素 ID
 * @returns DOM target
 */
function getTargetById(id: string): Element | null {
  return queryDrawingElementTarget(props.root, id);
}

/**
 * DOM 位移转换为世界坐标值。
 * @param value - DOM 坐标值
 * @returns 世界坐标值
 */
function domDeltaToWorld(value: number): number {
  return value / props.viewport.zoom;
}

/**
 * 创建 SVG 元素 transform 字符串。
 * @param element - 画板元素
 * @param translate - DOM 坐标平移量
 * @param size - 预览尺寸
 * @returns SVG transform
 */
function createPreviewTransform(element: DrawingElement, translate: [number, number], size: DrawingSize = element.size): string {
  return createDrawingElementTransform(
    {
      x: element.position.x + domDeltaToWorld(translate[0]),
      y: element.position.y + domDeltaToWorld(translate[1])
    },
    size,
    element.rotation
  );
}

/**
 * 更新 SVG 形状的预览尺寸。
 * @param target - SVG 元素目标
 * @param element - 画板元素
 * @param size - 预览尺寸
 */
function updateShapePreviewSize(target: Element, element: DrawingElement, size: DrawingSize): void {
  const shape = target.querySelector('.b-drawing-node__shape');
  if (!shape) {
    return;
  }

  if (element.kind === 'shape' && element.shape === 'ellipse') {
    shape.setAttribute('cx', String(size.width / 2));
    shape.setAttribute('cy', String(size.height / 2));
    shape.setAttribute('rx', String(size.width / 2));
    shape.setAttribute('ry', String(size.height / 2));
    return;
  }

  if (element.kind === 'shape' && isDrawingDiamondShape(element.shape)) {
    shape.setAttribute('points', createDrawingDiamondPoints(size));
    return;
  }

  shape.setAttribute('width', String(size.width));
  shape.setAttribute('height', String(size.height));
}

/**
 * 更新 SVG 文本的预览位置。
 * @param target - SVG 元素目标
 * @param size - 预览尺寸
 */
function updateTextPreviewPosition(target: Element, size: DrawingSize): void {
  const text = target.querySelector('.b-drawing-node__text');
  if (!text) {
    return;
  }

  text.setAttribute('x', String(size.width / 2));
  text.setAttribute('y', String(size.height / 2));
}

/**
 * 从拖拽结束事件创建几何移动变更。
 * @param event - Moveable 拖拽结束事件
 * @returns 几何变更，事件不完整时返回 null
 */
function createMoveChange(event: MoveableDragEndEvent): DrawingGeometryChange | null {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  const translate = event.lastEvent?.translate;
  if (!id || !element || !translate) {
    return null;
  }

  return {
    id,
    position: {
      x: element.position.x + domDeltaToWorld(translate[0]),
      y: element.position.y + domDeltaToWorld(translate[1])
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
 * @returns 几何变更，事件不完整时返回 null
 */
function createResizeChange(event: MoveableResizeEndEvent): DrawingGeometryChange | null {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  const payload = getResizePayload(event);
  if (!id || !element || payload.width === undefined || payload.height === undefined) {
    return null;
  }

  const translate = payload.drag?.beforeTranslate ?? [0, 0];
  return {
    id,
    position: {
      x: element.position.x + domDeltaToWorld(translate[0]),
      y: element.position.y + domDeltaToWorld(translate[1])
    },
    size: {
      width: payload.width,
      height: payload.height
    }
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

  const selectedTargets = props.selection.map(getTargetById).filter((target): target is Element => target !== null);
  const selectedIds = new Set<string>(props.selection);

  targets.value = selectedTargets;
  guidelineTargets.value =
    selectedTargets.length === 1
      ? props.elements
          .filter((element) => !selectedIds.has(element.id))
          .map((element) => getTargetById(element.id))
          .filter((target): target is Element => target !== null)
      : [];
  await nextTick();
  moveableRef.value?.updateRect();
}

/**
 * 处理 Moveable 拖动过程。
 * @param event - Moveable 拖动过程事件
 */
function handleDrag(event: MoveableDragEvent): void {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  if (!event.target || !element || !event.translate) {
    return;
  }

  event.target.setAttribute('transform', createPreviewTransform(element, event.translate));
}

/**
 * 处理 Moveable 缩放过程。
 * @param event - Moveable 缩放过程事件
 */
function handleResize(event: MoveableResizeEvent): void {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  if (!event.target || !element || event.width === undefined || event.height === undefined) {
    return;
  }

  const translate = event.drag?.beforeTranslate ?? [0, 0];
  const size = {
    width: event.width,
    height: event.height
  };

  event.target.setAttribute('transform', createPreviewTransform(element, translate, size));
  updateShapePreviewSize(event.target, element, size);
  updateTextPreviewPosition(event.target, size);
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
 * 处理 Moveable 多目标拖动过程。
 * @param event - Moveable 多目标拖动过程事件
 */
function handleDragGroup(event: MoveableGroupEvent<MoveableDragEvent>): void {
  event.events?.forEach(handleDrag);
}

/**
 * 处理 Moveable 多目标拖拽结束。
 * @param event - Moveable 多目标拖拽结束事件
 */
function handleDragGroupEnd(event: MoveableGroupEvent<MoveableDragEndEvent>): void {
  const changes = event.events?.map(createMoveChange).filter((change): change is DrawingGeometryChange => change !== null) ?? [];
  if (!changes.length) {
    return;
  }

  emit('move', changes);
}

/**
 * 处理 Moveable 缩放结束。
 * @param event - Moveable 缩放结束事件
 */
function handleResizeEnd(event: MoveableResizeEndEvent): void {
  const change = createResizeChange(event);
  if (!change) {
    return;
  }

  emit('resize', [change]);
}

/**
 * 处理 Moveable 多目标缩放过程。
 * @param event - Moveable 多目标缩放过程事件
 */
function handleResizeGroup(event: MoveableGroupEvent<MoveableResizeEvent>): void {
  event.events?.forEach(handleResize);
}

/**
 * 处理 Moveable 多目标缩放结束。
 * @param event - Moveable 多目标缩放结束事件
 */
function handleResizeGroupEnd(event: MoveableGroupEvent<MoveableResizeEndEvent>): void {
  const changes = event.events?.map(createResizeChange).filter((change): change is DrawingGeometryChange => change !== null) ?? [];
  if (!changes.length) {
    return;
  }

  emit('resize', changes);
}

onMounted(() => {
  syncTargets().catch((error: unknown): void => {
    console.warn('BDrawing Moveable target sync failed', error);
  });
});

watch(
  () => [
    props.root,
    props.selection,
    props.elements,
    props.enabled,
    props.viewport.center.x,
    props.viewport.center.y,
    props.viewport.zoom,
    props.viewportSize.width,
    props.viewportSize.height
  ],
  () => {
    syncTargets().catch((error: unknown): void => {
      console.warn('BDrawing Moveable target sync failed', error);
    });
  },
  { deep: true }
);
</script>

<style lang="less" scoped>
.b-drawing-moveable-layer {
  --moveable-control-padding: 12;

  :deep(.moveable-control) {
    width: 12px !important;
    height: 12px !important;
    margin-top: -6px !important;
    margin-left: -6px !important;
    background: var(--color-primary) !important;
    border: 2px solid var(--bg-primary) !important;
    box-shadow: 0 0 0 3px var(--color-primary-bg), 0 4px 10px var(--color-control-outline) !important;
  }

  :deep(.moveable-control:hover) {
    background: var(--color-primary-hover) !important;
    border-color: var(--bg-primary) !important;
    box-shadow: 0 0 0 4px var(--color-primary-bg-hover), 0 6px 14px var(--color-control-outline) !important;
  }

  :deep(.moveable-line) {
    background: var(--color-primary) !important;
    box-shadow: 0 0 0 1px var(--color-primary-bg);
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
}
</style>

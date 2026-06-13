<!--
  @file DrawingMoveableLayer.vue
  @description BDrawing Moveable 控制器适配层。
-->
<template>
  <div v-if="shouldShowMoveableLayer" class="b-drawing-moveable-layer">
    <VueMoveable
      ref="moveableRef"
      :target="targets"
      :draggable="true"
      :resizable="canResizeSelection"
      :snappable="singleTarget"
      :snap-center="true"
      :snap-gap="true"
      :snap-threshold="5"
      :snap-render-threshold="5"
      :snap-directions="snapDirections"
      :element-snap-directions="snapDirections"
      :element-guidelines="guidelineTargets"
      :padding="MOVEABLE_SELECTION_PADDING"
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
import type { DrawingConnectorPathElementOverride } from '../utils/drawingGeometry';
import type { SnapDirections } from 'moveable';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import VueMoveable from 'vue3-moveable/dist/moveable.js';
import {
  createDrawingConnectorMarkerPath,
  createDrawingConnectorPath,
  createDrawingDiamondPoints,
  createDrawingElementTransform,
  getDrawingElementRenderSize,
  getDrawingElementId,
  isDrawingConnectorElement,
  isDrawingDiamondShape,
  isDrawingShapeElement,
  queryDrawingElementTarget,
  resolveDrawingConnectorEndpointPoints
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
/** 是否展示 Moveable 控制层。 */
const shouldShowMoveableLayer = computed<boolean>(() => props.enabled && targets.value.length > 0);
/** Moveable 控制框与节点边界之间的视觉留白。 */
const MOVEABLE_SELECTION_PADDING = {
  bottom: 8,
  left: 8,
  right: 8,
  top: 8
};
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
 * 判断元素是否为文本节点。
 * @param element - 画板元素
 * @returns 是否为文本节点
 */
function isDrawingTextElement(element: DrawingElement): boolean {
  return isDrawingShapeElement(element) && element.shape === 'text';
}

/** 当前选中的画板元素。 */
const selectedElements = computed<DrawingElement[]>(() =>
  props.selection.map(getElementById).filter((element: DrawingElement | undefined): element is DrawingElement => element !== undefined)
);
/** 当前选区是否允许通过 Moveable 修改尺寸。 */
const canResizeSelection = computed<boolean>(() => selectedElements.value.every((element: DrawingElement): boolean => !isDrawingTextElement(element)));

/**
 * 通过元素 ID 读取 DOM target。
 * @param id - 元素 ID
 * @returns DOM target
 */
function getTargetById(id: string): Element | null {
  return queryDrawingElementTarget(props.root, id);
}

/**
 * 通过元素 ID 读取全部 DOM target。
 * @param id - 元素 ID
 * @returns DOM target 列表
 */
function getTargetsById(id: string): Element[] {
  return Array.from(props.root?.querySelectorAll(`[data-drawing-element-id="${id}"]`) ?? []);
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
 * 读取元素预览尺寸。
 * @param element - 画板元素
 * @returns 预览尺寸
 */
function getElementPreviewSize(element: DrawingElement): DrawingSize {
  return getDrawingElementRenderSize(element);
}

/**
 * 创建 SVG 元素 transform 字符串。
 * @param element - 画板元素
 * @param translate - DOM 坐标平移量
 * @param size - 预览尺寸
 * @returns SVG transform
 */
function createPreviewTransform(element: DrawingElement, translate: [number, number], size: DrawingSize = getElementPreviewSize(element)): string {
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
 * 将 Moveable 多选缩放尺寸转换为画板坐标尺寸。
 * @param size - Moveable 事件中的尺寸
 * @returns 画板坐标尺寸
 */
function groupResizeSizeToWorld(size: DrawingSize): DrawingSize {
  return {
    width: domDeltaToWorld(size.width),
    height: domDeltaToWorld(size.height)
  };
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
 * 更新关联连接线的预览路径。
 * @param overrides - 预览几何覆盖
 */
function updateConnectedConnectorPreviews(overrides: DrawingConnectorPathElementOverride[]): void {
  const overrideIds = new Set<string>(overrides.map((override: DrawingConnectorPathElementOverride): string => override.id));
  const connectors = props.elements.filter(
    (element: DrawingElement): boolean =>
      isDrawingConnectorElement(element) && (overrideIds.has(element.source.elementId) || overrideIds.has(element.target.elementId))
  );

  for (const connector of connectors) {
    if (!isDrawingConnectorElement(connector)) {
      continue;
    }

    const pathData = createDrawingConnectorPath(props.elements, connector, overrides);
    const markerStartPath = createDrawingConnectorMarkerPath(props.elements, connector, 'start', overrides);
    const markerEndPath = createDrawingConnectorMarkerPath(props.elements, connector, 'end', overrides);
    const endpointPoints = resolveDrawingConnectorEndpointPoints(props.elements, connector, overrides);
    const connectorTargets = getTargetsById(connector.id);
    connectorTargets.forEach((target: Element): void => {
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
 * @param shouldConvertGroupSize - 是否将多选缩放尺寸从 DOM 坐标转换为画板坐标
 * @returns 几何变更，事件不完整时返回 null
 */
function createResizeChange(event: MoveableResizeEndEvent, shouldConvertGroupSize = false): DrawingGeometryChange | null {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  const payload = getResizePayload(event);
  if (!id || !element || isDrawingTextElement(element) || payload.width === undefined || payload.height === undefined) {
    return null;
  }

  const translate = payload.drag?.beforeTranslate ?? [0, 0];
  const size = shouldConvertGroupSize
    ? groupResizeSizeToWorld({ width: payload.width, height: payload.height })
    : { width: payload.width, height: payload.height };
  return {
    id,
    position: {
      x: element.position.x + domDeltaToWorld(translate[0]),
      y: element.position.y + domDeltaToWorld(translate[1])
    },
    size
  };
}

/**
 * 预览 Moveable 拖动并返回连接线重算所需的几何覆盖。
 * @param event - Moveable 拖动过程事件
 * @returns 预览几何覆盖，事件不完整时返回 null
 */
function previewDragEvent(event: MoveableDragEvent): DrawingConnectorPathElementOverride | null {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  if (!event.target || !id || !element || !event.translate) {
    return null;
  }

  const position = {
    x: element.position.x + domDeltaToWorld(event.translate[0]),
    y: element.position.y + domDeltaToWorld(event.translate[1])
  };
  event.target.setAttribute('transform', createPreviewTransform(element, event.translate));

  return {
    id,
    position
  };
}

/**
 * 预览 Moveable 缩放并返回连接线重算所需的几何覆盖。
 * @param event - Moveable 缩放过程事件
 * @param shouldConvertGroupSize - 是否将多选缩放尺寸从 DOM 坐标转换为画板坐标
 * @returns 预览几何覆盖，事件不完整时返回 null
 */
function previewResizeEvent(event: MoveableResizeEvent, shouldConvertGroupSize = false): DrawingConnectorPathElementOverride | null {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  if (!event.target || !id || !element || isDrawingTextElement(element) || event.width === undefined || event.height === undefined) {
    return null;
  }

  const translate = event.drag?.beforeTranslate ?? [0, 0];
  const size = shouldConvertGroupSize ? groupResizeSizeToWorld({ width: event.width, height: event.height }) : { width: event.width, height: event.height };
  const position = {
    x: element.position.x + domDeltaToWorld(translate[0]),
    y: element.position.y + domDeltaToWorld(translate[1])
  };

  event.target.setAttribute('transform', createPreviewTransform(element, translate, size));
  updateShapePreviewSize(event.target, element, size);
  updateTextPreviewPosition(event.target, size);

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

  const shapeIds = new Set<string>(props.elements.filter(isDrawingShapeElement).map((element) => element.id));
  const selectedTargets = props.selection
    .filter((id: string): boolean => shapeIds.has(id))
    .map(getTargetById)
    .filter((target): target is Element => target !== null);
  const selectedIds = new Set<string>(props.selection);

  targets.value = selectedTargets;
  guidelineTargets.value =
    selectedTargets.length === 1
      ? props.elements
          .filter((element) => isDrawingShapeElement(element) && !selectedIds.has(element.id))
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
  const override = previewDragEvent(event);
  if (!override) {
    return;
  }

  updateConnectedConnectorPreviews([override]);
}

/**
 * 处理 Moveable 缩放过程。
 * @param event - Moveable 缩放过程事件
 * @param shouldConvertGroupSize - 是否将多选缩放尺寸从 DOM 坐标转换为画板坐标
 */
function handleResize(event: MoveableResizeEvent, shouldConvertGroupSize = false): void {
  const override = previewResizeEvent(event, shouldConvertGroupSize);
  if (!override) {
    return;
  }

  updateConnectedConnectorPreviews([override]);
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
  const overrides = event.events?.map(previewDragEvent).filter((override): override is DrawingConnectorPathElementOverride => override !== null) ?? [];
  if (!overrides.length) {
    return;
  }

  updateConnectedConnectorPreviews(overrides);
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
  const overrides =
    event.events
      ?.map((resizeEvent: MoveableResizeEvent): DrawingConnectorPathElementOverride | null => previewResizeEvent(resizeEvent, true))
      .filter((override): override is DrawingConnectorPathElementOverride => override !== null) ?? [];
  if (!overrides.length) {
    return;
  }

  updateConnectedConnectorPreviews(overrides);
}

/**
 * 处理 Moveable 多目标缩放结束。
 * @param event - Moveable 多目标缩放结束事件
 */
function handleResizeGroupEnd(event: MoveableGroupEvent<MoveableResizeEndEvent>): void {
  const changes =
    event.events
      ?.map((resizeEvent: MoveableResizeEndEvent): DrawingGeometryChange | null => createResizeChange(resizeEvent, true))
      .filter((change): change is DrawingGeometryChange => change !== null) ?? [];
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
    width: 8px !important;
    height: 8px !important;
    margin-top: -4px !important;
    margin-left: -4px !important;
    background: #fff !important;
    border: 1px solid var(--color-primary) !important;
    border-radius: 2px !important;
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

  :deep(.moveable-size-value:empty),
  :deep(.size-value:empty) {
    display: none !important;
  }
}
</style>

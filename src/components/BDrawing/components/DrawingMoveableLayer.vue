<!--
  @file DrawingMoveableLayer.vue
  @description BDrawing Moveable 控制器适配层。
-->
<template>
  <VueMoveable
    v-if="enabled && targets.length"
    class="b-drawing-moveable-layer"
    :target="targets"
    :draggable="true"
    :resizable="singleTarget"
    :snappable="singleTarget"
    :snap-center="true"
    :snap-gap="true"
    :snap-threshold="5"
    :snap-render-threshold="5"
    :snap-directions="snapDirections"
    :element-snap-directions="snapDirections"
    :element-guidelines="guidelineTargets"
    :origin="false"
    :throttle-drag="0"
    :throttle-resize="0"
    @drag="handleDrag"
    @drag-end="handleDragEnd"
    @resize="handleResize"
    @resize-end="handleResizeEnd"
  />
</template>

<script setup lang="ts">
import type { DrawingElement, DrawingGeometryChange, DrawingSize, DrawingViewport } from '../types';
import type { SnapDirections } from 'moveable';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import VueMoveable from 'vue3-moveable/dist/moveable.js';

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
}

/**
 * Moveable 缩放过程事件。
 */
type MoveableResizeEvent = MoveableResizeEndEvent;

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

const targets = ref<Element[]>([]);
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
  return target?.getAttribute('data-drawing-element-id') ?? null;
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
  return props.root?.querySelector(`[data-drawing-element-id="${id}"]`) ?? null;
}

/**
 * DOM 尺寸或位移转换为世界坐标值。
 * @param value - DOM 坐标值
 * @returns 世界坐标值
 */
function domValueToWorld(value: number): number {
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
  const x = element.position.x + domValueToWorld(translate[0]);
  const y = element.position.y + domValueToWorld(translate[1]);
  const rotateCenterX = size.width / 2;
  const rotateCenterY = size.height / 2;

  if (!element.rotation) {
    return `translate(${x}, ${y})`;
  }

  return `translate(${x}, ${y}) rotate(${element.rotation}, ${rotateCenterX}, ${rotateCenterY})`;
}

/**
 * 生成菱形点位。
 * @param size - 元素尺寸
 * @returns SVG polygon points
 */
function createDiamondPoints(size: DrawingSize): string {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;

  return `${halfWidth},0 ${size.width},${halfHeight} ${halfWidth},${size.height} 0,${halfHeight}`;
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

  if (element.kind === 'shape' && (element.shape === 'diamond' || element.shape === 'decision')) {
    shape.setAttribute('points', createDiamondPoints(size));
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
    width: domValueToWorld(event.width),
    height: domValueToWorld(event.height)
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
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  const translate = event.lastEvent?.translate;
  if (!id || !element || !translate) {
    return;
  }

  emit('move', [
    {
      id,
      position: {
        x: element.position.x + domValueToWorld(translate[0]),
        y: element.position.y + domValueToWorld(translate[1])
      }
    }
  ]);
}

/**
 * 处理 Moveable 缩放结束。
 * @param event - Moveable 缩放结束事件
 */
function handleResizeEnd(event: MoveableResizeEndEvent): void {
  const id = getTargetId(event.target);
  const element = id ? getElementById(id) : undefined;
  if (!id || !element || event.width === undefined || event.height === undefined) {
    return;
  }

  const translate = event.drag?.beforeTranslate ?? [0, 0];
  emit('resize', [
    {
      id,
      position: {
        x: element.position.x + domValueToWorld(translate[0]),
        y: element.position.y + domValueToWorld(translate[1])
      },
      size: {
        width: domValueToWorld(event.width),
        height: domValueToWorld(event.height)
      }
    }
  ]);
}

onMounted(() => {
  syncTargets().catch((error: unknown): void => {
    console.warn('BDrawing Moveable target sync failed', error);
  });
});

watch(
  () => [props.root, props.selection, props.elements, props.enabled],
  () => {
    syncTargets().catch((error: unknown): void => {
      console.warn('BDrawing Moveable target sync failed', error);
    });
  },
  { deep: true }
);
</script>

<style lang="less" scoped>
.b-drawing-moveable-layer :global(.moveable-guideline-group .moveable-size-value),
.b-drawing-moveable-layer :global(.guideline-group .size-value) {
  min-width: max-content;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}
</style>

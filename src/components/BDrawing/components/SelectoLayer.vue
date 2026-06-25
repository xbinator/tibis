<!--
  @file SelectoLayer.vue
  @description BDrawing Selecto 框选适配层。
-->
<template>
  <div class="b-drawing-selecto-layer" aria-hidden="true"></div>
</template>

<script setup lang="ts">
import type { DrawingSize, DrawingViewport } from '../types';
import { onBeforeUnmount, onMounted, watch } from 'vue';
import Selecto from 'selecto';
import { DRAWING_SELECTO_BLOCKED_DRAG_SELECTOR } from '../constants/interaction';
import { getDrawingElementId } from '../utils/drawingGeometry';

/**
 * Selecto 框选结束事件。
 */
interface SelectoEndEvent {
  /** 命中的 DOM 目标 */
  selected: Array<HTMLElement | SVGElement>;
  /** 原始输入事件 */
  inputEvent?: {
    /** 是否按住 Shift */
    shiftKey?: boolean;
  };
}

/**
 * Selecto 拖拽起始事件。
 */
interface SelectoDragStartEvent {
  /** 原始输入事件 */
  inputEvent?: Event;
}

/**
 * Selecto 图层入参。
 */
interface Props {
  /** 画板根节点 */
  root: HTMLElement | null;
  /** 当前工具模式 */
  activeTool: string;
  /** 当前选区 */
  selection: string[];
  /** 当前视口 */
  viewport: DrawingViewport;
  /** 当前视口渲染尺寸 */
  viewportSize: DrawingSize;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 设置选区 */
  'set-selection': [selection: string[]];
}>();

let selecto: Selecto | null = null;
let selectoViewportRefreshFrame: ReturnType<typeof requestAnimationFrame> | null = null;

/**
 * 读取 DOM 目标的画板元素 ID。
 * @param target - DOM 目标
 * @returns 元素 ID
 */
function getTargetId(target: HTMLElement | SVGElement): string | null {
  return getDrawingElementId(target);
}

/**
 * 合并选区并保持顺序稳定。
 * @param current - 当前选区
 * @param incoming - 新命中选区
 * @returns 合并后的选区
 */
function mergeSelection(current: string[], incoming: string[]): string[] {
  return [...new Set([...current, ...incoming])];
}

/**
 * 判断 Selecto 是否应该从当前输入目标启动框选。
 * @param event - Selecto 拖拽起始事件
 * @returns 是否允许启动框选
 */
function shouldStartSelectoDrag(event: SelectoDragStartEvent): boolean {
  const target = event.inputEvent?.target;
  if (!(target instanceof Element)) {
    return true;
  }

  return target.closest(DRAWING_SELECTO_BLOCKED_DRAG_SELECTOR) === null;
}

/**
 * 处理 Selecto 框选结束。
 * @param event - Selecto 结束事件
 */
function handleSelectEnd(event: SelectoEndEvent): void {
  if (props.activeTool !== 'select') {
    return;
  }

  const selectedIds = event.selected.map(getTargetId).filter((id): id is string => id !== null);
  emit('set-selection', event.inputEvent?.shiftKey ? mergeSelection(props.selection, selectedIds) : selectedIds);
}

/**
 * 创建 Selecto 实例。
 */
function createSelecto(): void {
  if (!props.root || props.activeTool !== 'select' || selecto) {
    return;
  }

  selecto = new Selecto({
    className: 'b-drawing-selecto-selection',
    container: props.root,
    dragContainer: props.root,
    selectableTargets: ['.b-drawing-element'],
    hitRate: 0,
    selectFromInside: false,
    preventDragFromInside: true,
    dragCondition: shouldStartSelectoDrag
  });
  selecto.on('selectEnd', (event: SelectoEndEvent): void => handleSelectEnd(event));
}

/**
 * 刷新 Selecto 的可选元素缓存与滚动状态。
 */
function refreshSelectoViewport(): void {
  if (!selecto || props.activeTool !== 'select') {
    return;
  }

  selecto.findSelectableTargets();
  selecto.checkScroll();
}

/**
 * 取消已排队的 Selecto 视口刷新。
 */
function cancelSelectoViewportRefresh(): void {
  if (selectoViewportRefreshFrame === null) {
    return;
  }

  cancelAnimationFrame(selectoViewportRefreshFrame);
  selectoViewportRefreshFrame = null;
}

/**
 * 将 Selecto 目标刷新排到下一帧，等待 SVG viewBox 完成布局。
 */
function scheduleSelectoViewportRefresh(): void {
  if (!selecto || props.activeTool !== 'select' || selectoViewportRefreshFrame !== null) {
    return;
  }

  selectoViewportRefreshFrame = requestAnimationFrame((): void => {
    selectoViewportRefreshFrame = null;
    refreshSelectoViewport();
  });
}

/**
 * 销毁 Selecto 实例。
 */
function destroySelecto(): void {
  cancelSelectoViewportRefresh();
  selecto?.destroy();
  selecto = null;
}

onMounted(() => {
  createSelecto();
});

onBeforeUnmount(() => {
  destroySelecto();
});

watch(
  () => [props.root, props.activeTool],
  () => {
    destroySelecto();
    createSelecto();
  }
);

watch(
  () => [props.viewport.center.x, props.viewport.center.y, props.viewport.zoom, props.viewportSize.width, props.viewportSize.height],
  () => {
    scheduleSelectoViewportRefresh();
  },
  { flush: 'post' }
);
</script>

<style lang="less" scoped>
:global(.b-drawing-selecto-selection.selecto-selection) {
  background: color-mix(in srgb, var(--color-primary-bg) 72%, transparent);
  border: 1px solid var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary-bg);
}
</style>

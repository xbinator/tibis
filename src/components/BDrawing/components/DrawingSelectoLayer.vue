<!--
  @file DrawingSelectoLayer.vue
  @description BDrawing Selecto 框选适配层。
-->
<template>
  <div class="b-drawing-selecto-layer" aria-hidden="true"></div>
</template>

<script setup lang="ts">
import type { DrawingToolMode } from '../types';
import { onBeforeUnmount, onMounted, watch } from 'vue';
import Selecto from 'selecto';
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
  activeTool: DrawingToolMode;
  /** 当前选区 */
  selection: string[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 设置选区 */
  'set-selection': [selection: string[]];
}>();

let selecto: Selecto | null = null;
/** Selecto 不应该从这些交互目标启动，避免抢占 Moveable 拖拽和缩放。 */
const SELECTO_BLOCKED_DRAG_SELECTOR = [
  '.b-drawing-moveable-layer',
  '.moveable-control',
  '.moveable-line',
  '.moveable-area',
  '.moveable-control-box',
  '.moveable-direction',
  '.b-drawing-element.is-selected'
].join(', ');

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

  return target.closest(SELECTO_BLOCKED_DRAG_SELECTOR) === null;
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
 * 销毁 Selecto 实例。
 */
function destroySelecto(): void {
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
</script>

<style lang="less" scoped>
:global(.b-drawing-selecto-selection.selecto-selection) {
  background: color-mix(in srgb, var(--color-primary-bg) 72%, transparent);
  border: 1px solid var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary-bg);
}
</style>

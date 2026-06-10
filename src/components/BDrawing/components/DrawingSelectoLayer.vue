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

/**
 * 读取 DOM 目标的画板元素 ID。
 * @param target - DOM 目标
 * @returns 元素 ID
 */
function getTargetId(target: HTMLElement | SVGElement): string | null {
  return target.getAttribute('data-drawing-element-id');
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
    container: props.root,
    dragContainer: props.root,
    selectableTargets: ['.b-drawing-element'],
    hitRate: 0,
    selectFromInside: false,
    preventDragFromInside: true
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

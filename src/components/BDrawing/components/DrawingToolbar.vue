<!--
  @file DrawingToolbar.vue
  @description BDrawing 顶部工具栏。
-->
<template>
  <div class="b-drawing-toolbar">
    <button
      class="b-drawing-toolbar__button"
      :class="{ 'is-active': activeTool === 'select' }"
      type="button"
      data-testid="drawing-select-tool"
      aria-label="选择工具"
      @click="emit('set-tool', 'select')"
    >
      <BIcon icon="lucide:mouse-pointer-2" size="16" />
    </button>
    <button
      class="b-drawing-toolbar__button"
      :class="{ 'is-active': activeTool === 'hand' }"
      type="button"
      data-testid="drawing-hand-tool"
      aria-label="拖动画布"
      @click="emit('set-tool', 'hand')"
    >
      <BIcon icon="lucide:hand" size="16" />
    </button>
    <span class="b-drawing-toolbar__divider"></span>
    <button
      class="b-drawing-toolbar__button b-drawing-toolbar__button--primary"
      :class="{ 'is-active': activeTool === 'process' }"
      type="button"
      data-testid="drawing-add-process"
      aria-label="新增流程节点"
      @click="emit('set-tool', 'process')"
    >
      <BIcon icon="lucide:square-plus" size="16" />
    </button>
    <span class="b-drawing-toolbar__divider"></span>
    <button class="b-drawing-toolbar__button" type="button" aria-label="撤销" @click="emit('undo')">
      <BIcon icon="lucide:undo-2" size="16" />
    </button>
    <button class="b-drawing-toolbar__button" type="button" aria-label="重做" @click="emit('redo')">
      <BIcon icon="lucide:redo-2" size="16" />
    </button>
    <button class="b-drawing-toolbar__button" type="button" data-testid="drawing-delete" aria-label="删除选中元素" @click="emit('delete')">
      <BIcon icon="lucide:trash-2" size="16" />
    </button>
    <span class="b-drawing-toolbar__divider"></span>
    <button class="b-drawing-toolbar__button" type="button" aria-label="缩小" @click="emit('zoom-out')">
      <BIcon icon="lucide:zoom-out" size="16" />
    </button>
    <span class="b-drawing-toolbar__zoom" data-testid="drawing-zoom-value">{{ zoomPercent }}</span>
    <button class="b-drawing-toolbar__button" type="button" data-testid="drawing-zoom-in" aria-label="放大" @click="emit('zoom-in')">
      <BIcon icon="lucide:zoom-in" size="16" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { DrawingToolMode } from '../types';
import { computed } from 'vue';
import BIcon from '@/components/BIcon/index.vue';

/**
 * 工具栏入参。
 */
interface Props {
  /** 缩放比例 */
  zoom: number;
  /** 当前工具模式 */
  activeTool: DrawingToolMode;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 设置工具模式 */
  'set-tool': [tool: DrawingToolMode];
  /** 撤销 */
  undo: [];
  /** 重做 */
  redo: [];
  /** 删除 */
  delete: [];
  /** 放大 */
  'zoom-in': [];
  /** 缩小 */
  'zoom-out': [];
}>();

const zoomPercent = computed<string>(() => `${Math.round(props.zoom * 100)}%`);
</script>

<style lang="less" scoped>
.b-drawing-toolbar {
  display: flex;
  gap: 2px;
  align-items: center;
  padding: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
}

.b-drawing-toolbar__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--text-secondary);
  cursor: pointer;
  outline: none;
  background: transparent;
  border: none;
  border-radius: 6px;
  transition: color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}

.b-drawing-toolbar__button:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.b-drawing-toolbar__button.is-active {
  color: var(--color-primary);
  background: var(--color-primary-bg);
}

.b-drawing-toolbar__button:focus-visible {
  box-shadow: 0 0 0 2px var(--color-control-outline);
}

.b-drawing-toolbar__button--primary {
  color: var(--color-primary);
}

.b-drawing-toolbar__button--primary:hover {
  color: var(--color-primary-hover);
  background: var(--color-primary-bg-hover);
}

.b-drawing-toolbar__divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--border-primary);
}

.b-drawing-toolbar__zoom {
  min-width: 42px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-align: center;
  user-select: none;
}
</style>

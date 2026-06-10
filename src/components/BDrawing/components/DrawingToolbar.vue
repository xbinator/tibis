<!--
  @file DrawingToolbar.vue
  @description BDrawing 画布悬浮工具栏，内部定位分组。
-->
<template>
  <div class="b-drawing-toolbar">
    <!-- 顶部水平居中：工具选择 -->
    <div class="b-drawing-toolbar__group b-drawing-toolbar__group--top">
      <BButton
        data-testid="drawing-select-tool"
        type="text"
        square
        size="small"
        tooltip="选择工具"
        :class="{ 'is-active': activeTool === 'select' }"
        @click="emit('set-tool', 'select')"
      >
        <BIcon icon="lucide:mouse-pointer-2" :size="16" />
      </BButton>
      <BButton
        data-testid="drawing-hand-tool"
        type="text"
        square
        size="small"
        tooltip="拖动画布"
        :class="{ 'is-active': activeTool === 'hand' }"
        @click="emit('set-tool', 'hand')"
      >
        <BIcon icon="lucide:hand" :size="16" />
      </BButton>
      <span class="b-drawing-toolbar__divider"></span>
      <BButton
        data-testid="drawing-add-rect"
        type="text"
        square
        size="small"
        tooltip="矩形"
        :class="{ 'is-active': activeTool === 'rect' }"
        @click="emit('set-tool', 'rect')"
      >
        <BIcon icon="lucide:square" :size="16" />
      </BButton>
      <BButton
        data-testid="drawing-add-ellipse"
        type="text"
        square
        size="small"
        tooltip="椭圆"
        :class="{ 'is-active': activeTool === 'ellipse' }"
        @click="emit('set-tool', 'ellipse')"
      >
        <BIcon icon="lucide:circle" :size="16" />
      </BButton>
      <BButton
        data-testid="drawing-add-diamond"
        type="text"
        square
        size="small"
        tooltip="菱形"
        :class="{ 'is-active': activeTool === 'diamond' }"
        @click="emit('set-tool', 'diamond')"
      >
        <BIcon icon="lucide:diamond" :size="16" />
      </BButton>
      <BButton
        data-testid="drawing-add-text"
        type="text"
        square
        size="small"
        tooltip="文本"
        :class="{ 'is-active': activeTool === 'text' }"
        @click="emit('set-tool', 'text')"
      >
        <BIcon icon="lucide:type" :size="16" />
      </BButton>
      <BButton
        data-testid="drawing-connector-tool"
        type="text"
        square
        size="small"
        tooltip="连接线"
        :class="{ 'is-active': activeTool === 'connector' }"
        @click="emit('set-tool', 'connector')"
      >
        <BIcon icon="lucide:arrow-right" :size="16" />
      </BButton>
    </div>

    <!-- 左下角：历史记录 -->
    <div class="b-drawing-toolbar__group b-drawing-toolbar__group--bottom-left">
      <BButton type="text" square size="small" tooltip="撤销" aria-label="撤销" @click="emit('undo')">
        <BIcon icon="lucide:undo-2" :size="16" />
      </BButton>
      <BButton type="text" square size="small" tooltip="重做" aria-label="重做" @click="emit('redo')">
        <BIcon icon="lucide:redo-2" :size="16" />
      </BButton>
    </div>

    <!-- 左下角：缩放控制 -->
    <div class="b-drawing-toolbar__group b-drawing-toolbar__group--bottom-left-zoom">
      <BButton data-testid="drawing-zoom-out" type="text" square size="small" tooltip="缩小" @click="emit('zoom-out')">
        <BIcon icon="lucide:minus" :size="16" />
      </BButton>
      <span class="b-drawing-toolbar__zoom" data-testid="drawing-zoom-value">{{ zoomPercent }}</span>
      <BButton data-testid="drawing-zoom-in" type="text" square size="small" tooltip="放大" @click="emit('zoom-in')">
        <BIcon icon="lucide:plus" :size="16" />
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DrawingToolMode } from '../types';
import { computed } from 'vue';
import BButton from '@/components/BButton/index.vue';
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
  /** 放大 */
  'zoom-in': [];
  /** 缩小 */
  'zoom-out': [];
}>();

const zoomPercent = computed<string>(() => `${Math.round(props.zoom * 100)}%`);
</script>

<style lang="less" scoped>
.b-drawing-toolbar {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
}

/** 各分组统一样式 + 允许点击 */
.b-drawing-toolbar__group {
  position: absolute;
  display: flex;
  gap: 2px;
  align-items: center;
  padding: 4px;
  pointer-events: auto;
  background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(12px);
}

/** 顶部水平居中 */
.b-drawing-toolbar__group--top {
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
}

/** 左下角 - 历史记录 */
.b-drawing-toolbar__group--bottom-left {
  bottom: 12px;
  left: 12px;
}

/** 左下角 - 缩放控制，位于历史记录右侧 */
.b-drawing-toolbar__group--bottom-left-zoom {
  bottom: 12px;
  left: 90px;
  gap: 4px;
}

/** 高亮当前激活的工具 */
.b-drawing-toolbar :deep(.is-active) {
  color: var(--color-primary);
  background: var(--color-primary-bg);
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
  color: var(--text-tertiary);
  text-align: center;
  user-select: none;
}
</style>

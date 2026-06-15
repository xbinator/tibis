<!--
  @file Toolbar.vue
  @description BDrawing 画布悬浮工具栏，内部定位分组。
-->
<template>
  <div class="b-drawing-toolbar">
    <!-- 顶部水平居中：工具选择 -->
    <div class="b-drawing-toolbar__group b-drawing-toolbar__group--top">
      <BButton type="text" square size="small" :class="{ 'is-active': activeTool === 'select' }" @click="emit('set-tool', 'select')">
        <BIcon icon="lucide:mouse-pointer-2" :size="16" />
      </BButton>
      <BButton type="text" square size="small" :class="{ 'is-active': activeTool === 'hand' }" @click="emit('set-tool', 'hand')">
        <BIcon icon="lucide:hand" :size="16" />
      </BButton>
      <span class="b-drawing-toolbar__divider"></span>
      <BButton type="text" square size="small" :class="{ 'is-active': activeTool === 'rect' }" @click="emit('set-tool', 'rect')">
        <BIcon icon="lucide:square" :size="16" />
      </BButton>
      <BButton type="text" square size="small" :class="{ 'is-active': activeTool === 'ellipse' }" @click="emit('set-tool', 'ellipse')">
        <BIcon icon="lucide:circle" :size="16" />
      </BButton>
      <BButton type="text" square size="small" :class="{ 'is-active': activeTool === 'diamond' }" @click="emit('set-tool', 'diamond')">
        <BIcon icon="lucide:diamond" :size="16" />
      </BButton>
      <BButton type="text" square size="small" :class="{ 'is-active': activeTool === 'text' }" @click="emit('set-tool', 'text')">
        <BIcon icon="lucide:type" :size="16" />
      </BButton>
      <BButton type="text" square size="small" :class="{ 'is-active': activeTool === 'connector' }" @click="emit('set-tool', 'connector')">
        <BIcon icon="lucide:arrow-right" :size="16" />
      </BButton>
    </div>

    <!-- 左下角：历史记录 / 缩放控制 / 小地图 -->
    <div class="b-drawing-toolbar__group b-drawing-toolbar__group--bottom-left">
      <BButton type="text" square size="small" aria-label="撤销" :disabled="!canUndo" @click="emit('undo')">
        <BIcon icon="lucide:undo-2" :size="16" />
      </BButton>
      <BButton type="text" square size="small" aria-label="重做" :disabled="!canRedo" @click="emit('redo')">
        <BIcon icon="lucide:redo-2" :size="16" />
      </BButton>
      <span class="b-drawing-toolbar__divider"></span>
      <BButton type="text" square size="small" aria-label="缩小" :disabled="!canZoomOut" @click="emit('zoom-out')">
        <BIcon icon="lucide:minus" :size="16" />
      </BButton>
      <button class="b-drawing-toolbar__zoom" type="button" @click="emit('reset-zoom')">
        {{ zoomPercent }}
      </button>
      <BButton type="text" square size="small" aria-label="放大" :disabled="!canZoomIn" @click="emit('zoom-in')">
        <BIcon icon="lucide:plus" :size="16" />
      </BButton>
      <span class="b-drawing-toolbar__divider"></span>
      <Minimap
        :elements="elements"
        :viewport="viewport"
        :viewport-size="viewportSize"
        @set-center="emit('set-center', $event)"
        @set-zoom="emit('set-zoom', $event)"
      >
        <template #default="{ open }">
          <BButton type="text" square size="small" class="b-drawing-toolbar__minimap" :class="{ 'is-active': open }" aria-label="小地图">
            <BIcon icon="lucide:map" :size="16" />
          </BButton>
        </template>
      </Minimap>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DrawingElement, DrawingPoint, DrawingSize, DrawingToolMode, DrawingViewport } from '../types';
import { computed } from 'vue';
import { DRAWING_MAX_ZOOM, DRAWING_MIN_ZOOM } from '../constants/viewport';
import Minimap from './Minimap.vue';

/**
 * 工具栏入参。
 */
interface Props {
  /** 缩放比例 */
  zoom: number;
  /** 当前工具模式 */
  activeTool: DrawingToolMode;
  /** 画板元素列表 */
  elements: DrawingElement[];
  /** 当前视口 */
  viewport: DrawingViewport;
  /** 当前视口渲染尺寸 */
  viewportSize: DrawingSize;
  /** 是否允许撤销 */
  canUndo: boolean;
  /** 是否允许重做 */
  canRedo: boolean;
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
  /** 重置缩放 */
  'reset-zoom': [];
  /** 设置视口中心 */
  'set-center': [center: DrawingPoint];
  /** 设置缩放比例 */
  'set-zoom': [zoom: number];
}>();

const zoomPercent = computed<string>(() => `${Math.round(props.zoom * 100)}%`);
/** 当前缩放是否仍允许继续缩小。 */
const canZoomOut = computed<boolean>(() => props.zoom > DRAWING_MIN_ZOOM);
/** 当前缩放是否仍允许继续放大。 */
const canZoomIn = computed<boolean>(() => props.zoom < DRAWING_MAX_ZOOM);
</script>

<style lang="less" scoped>
.b-drawing-toolbar {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

/** 各分组统一样式 + 允许点击 */
.b-drawing-toolbar__group {
  position: absolute;
  z-index: 2;
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

/** 左下角 - 历史记录 / 缩放控制 / 小地图 */
.b-drawing-toolbar__group--bottom-left {
  bottom: 12px;
  left: 12px;
  gap: 4px;
}

/** 高亮当前激活的工具 */
.b-drawing-toolbar :deep(.is-active) {
  color: var(--color-primary);
  background: var(--color-primary-bg);
}

.b-drawing-toolbar__minimap {
  color: var(--text-secondary);
}

.b-drawing-toolbar__divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--border-primary);
}

.b-drawing-toolbar__zoom {
  min-width: 42px;
  height: 28px;
  padding: 0 4px;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: none;
  border-radius: 4px;

  &:hover,
  &:focus-visible {
    color: var(--text-primary);
    outline: none;
    background: var(--bg-tertiary);
  }
}
</style>

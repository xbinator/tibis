<!--
  @file RuntimeView.vue
  @description BDrawing 运行态只读画布视图。
-->
<template>
  <section ref="rootRef" class="b-drawing-runtime-view" data-testid="drawing-runtime-view">
    <InfiniteViewport>
      <DrawingCanvas
        :elements="drawingData.elements"
        :selection="EMPTY_SELECTION"
        :geometry-preview-changes="EMPTY_GEOMETRY_PREVIEW_CHANGES"
        :viewport="drawingData.viewport"
        :viewport-size="viewportSize"
        :viewport-ready="isViewportReady"
        active-tool="runtime"
        @select="ignoreElementEvent"
        @element-pointerup="ignoreElementEvent"
        @canvas-pointerdown="ignoreCanvasPointerEvent"
        @canvas-pointermove="ignoreCanvasPointerEvent"
        @canvas-pointerup="ignoreCanvasPointerEvent"
        @canvas-wheel="ignoreCanvasWheel"
        @context-menu="ignoreContextMenu"
      />
    </InfiniteViewport>
  </section>
</template>

<script setup lang="ts">
import type { DrawingData, DrawingGeometryChange, DrawingRenderContext } from './types';
import { computed } from 'vue';
import InfiniteViewport from './components/InfiniteViewport.vue';
import { provideRenderContext } from './hooks/useRenderContext';
import { useViewportSize } from './hooks/useViewportSize';
import DrawingCanvas from './renderers/DrawingCanvas.vue';

/**
 * 运行态画布视图入参。
 */
interface Props {
  /** 画布模板数据 */
  drawingData: DrawingData;
  /** 运行态渲染上下文 */
  renderContext: DrawingRenderContext;
}

const props = defineProps<Props>();

/** 运行态不展示选区。 */
const EMPTY_SELECTION: string[] = [];
/** 运行态不展示编辑预览几何。 */
const EMPTY_GEOMETRY_PREVIEW_CHANGES: DrawingGeometryChange[] = [];
/** 运行态渲染上下文响应式包装。 */
const providedRenderContext = computed<DrawingRenderContext>(() => props.renderContext);

provideRenderContext(providedRenderContext);

const { rootRef, viewportSize, isViewportReady } = useViewportSize();

/**
 * 忽略运行态节点事件。
 */
function ignoreElementEvent(): void {
  return undefined;
}

/**
 * 忽略运行态画布指针事件。
 */
function ignoreCanvasPointerEvent(): void {
  return undefined;
}

/**
 * 忽略运行态滚轮事件。
 */
function ignoreCanvasWheel(): void {
  return undefined;
}

/**
 * 忽略运行态右键菜单事件。
 */
function ignoreContextMenu(): void {
  return undefined;
}
</script>

<style lang="less" scoped>
.b-drawing-runtime-view {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.b-drawing-runtime-view :deep(.b-drawing-node) {
  cursor: default;
}
</style>

<!--
  @file index.vue
  @description 独立画图工具组件。
-->
<template>
  <section class="b-drawing" tabindex="0" @keydown="handleKeydown">
    <header class="b-drawing__header">
      <DrawingToolbar
        :zoom="board.state.value.viewport.zoom"
        :active-tool="activeTool"
        @set-tool="setActiveTool"
        @undo="board.undo"
        @redo="board.redo"
        @delete="interaction.deleteSelection"
        @zoom-in="viewport.zoomIn"
        @zoom-out="viewport.zoomOut"
      />
    </header>
    <DrawingCanvas
      :nodes="board.state.value.nodes"
      :edges="board.state.value.edges"
      :selection="board.state.value.selection"
      :viewport="board.state.value.viewport"
      :active-tool="activeTool"
      @select="interaction.selectElement"
      @canvas-pointerdown="handleCanvasPointerdown"
    />
  </section>
</template>

<script setup lang="ts">
import type { DrawingPoint, DrawingToolMode } from './types';
import { ref } from 'vue';
import DrawingToolbar from './components/DrawingToolbar.vue';
import { useDrawingBoard } from './hooks/useDrawingBoard';
import { useDrawingInteraction } from './hooks/useDrawingInteraction';
import { useDrawingViewport } from './hooks/useDrawingViewport';
import DrawingCanvas from './renderers/DrawingCanvas.vue';

const board = useDrawingBoard();
const viewport = useDrawingViewport(board);
const interaction = useDrawingInteraction(board);
const activeTool = ref<DrawingToolMode>('select');

/**
 * 设置当前画板工具。
 * @param tool - 目标工具
 */
function setActiveTool(tool: DrawingToolMode): void {
  activeTool.value = tool;
}

/**
 * 处理画布空白区域按下。
 * @param point - 画板坐标
 */
function handleCanvasPointerdown(point: DrawingPoint): void {
  if (activeTool.value === 'process') {
    board.addNode('process', point);
    return;
  }

  interaction.clearSelection();
}

/**
 * 处理 Drawnix 风格基础快捷键。
 * @param event - 键盘事件
 */
function handleKeydown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();

  if ((event.metaKey || event.ctrlKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) {
      board.redo();
      return;
    }
    board.undo();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && key === 'y') {
    event.preventDefault();
    board.redo();
    return;
  }

  if (key === 'escape' || key === 'v') {
    event.preventDefault();
    setActiveTool('select');
    return;
  }

  if (key === 'h') {
    event.preventDefault();
    setActiveTool('hand');
    return;
  }

  if (key === 'p') {
    event.preventDefault();
    setActiveTool('process');
    return;
  }

  if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    interaction.deleteSelection();
  }
}
</script>

<style lang="less" scoped>
.b-drawing {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  outline: none;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.b-drawing__header {
  display: flex;
  flex-shrink: 0;
  gap: 12px;
  align-items: center;
  min-height: 48px;
  padding: 8px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
}
</style>

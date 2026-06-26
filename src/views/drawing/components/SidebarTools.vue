<!--
  @file SidebarTools.vue
  @description 画图页面侧边栏工具网格，展示可拖拽的画图元素工具项。
-->
<template>
  <div class="sidebar-panel__tool-grid">
    <div
      v-for="schema in drawingElementSchemas"
      :key="schema.name"
      class="sidebar-panel__tool-item"
      draggable="true"
      @dragend="handleToolDragEnd"
      @dragstart="handleToolDragStart(schema, $event)"
    >
      <BIcon :icon="schema.icon" :size="16" />
      <span>{{ schema.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DRAWING_ELEMENT_SCHEMAS } from '@/components/BDrawing/elements';
import type { DrawingElementSchema } from '@/components/BDrawing/elements';
import { setDrawingElementDragData } from '../utils/drag';

/** 当前可创建元素列表。 */
const drawingElementSchemas = DRAWING_ELEMENT_SCHEMAS;
/** 当前拖拽工具的自定义预览节点。 */
let toolDragPreviewElement: HTMLElement | null = null;

/**
 * 移除工具拖拽预览节点。
 */
function removeToolDragPreview(): void {
  toolDragPreviewElement?.remove();
  toolDragPreviewElement = null;
}

/**
 * 创建工具拖拽预览节点。
 * @param schema - 元素注册配置
 * @param sourceElement - 拖拽源节点
 * @returns 拖拽预览节点
 */
function createToolDragPreviewElement(schema: DrawingElementSchema, sourceElement: HTMLElement): HTMLElement {
  const clonedElement = sourceElement.cloneNode(true);
  const previewElement = clonedElement instanceof HTMLElement ? clonedElement : document.createElement('div');
  previewElement.classList.add('sidebar-panel__tool-item--drag-preview');
  previewElement.style.width = `${sourceElement.offsetWidth}px`;
  previewElement.style.height = `${sourceElement.offsetHeight}px`;
  if (!previewElement.textContent?.trim()) {
    previewElement.textContent = schema.label;
  }
  document.body.appendChild(previewElement);

  return previewElement;
}

/**
 * 设置工具拖拽时的圆角预览。
 * @param schema - 元素注册配置
 * @param event - 拖拽事件
 */
function setToolDragPreview(schema: DrawingElementSchema, event: DragEvent): void {
  if (!event.dataTransfer || !(event.currentTarget instanceof HTMLElement)) {
    return;
  }

  removeToolDragPreview();
  const previewElement = createToolDragPreviewElement(schema, event.currentTarget);
  toolDragPreviewElement = previewElement;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setDragImage(previewElement, previewElement.offsetWidth / 2, previewElement.offsetHeight / 2);
}

/**
 * 开始拖拽创建工具。
 * @param schema - 元素注册配置
 * @param event - 拖拽事件
 */
function handleToolDragStart(schema: DrawingElementSchema, event: DragEvent): void {
  setDrawingElementDragData(event.dataTransfer, {
    name: schema.name
  });
  setToolDragPreview(schema, event);
}

/**
 * 结束拖拽创建工具。
 */
function handleToolDragEnd(): void {
  removeToolDragPreview();
}
</script>

<style lang="less" scoped>
.sidebar-panel__tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.sidebar-panel__tool-item {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  overflow: hidden;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: grab;
  user-select: none;
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: 6px;
  transition: color 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
}

.sidebar-panel__tool-item:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-color: var(--border-primary);
}

.sidebar-panel__tool-item:active {
  cursor: grabbing;
}

.sidebar-panel__tool-item--drag-preview {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483647;
  pointer-events: none;
  border-color: var(--border-secondary);
  border-radius: 6px;
  box-shadow: 0 8px 18px rgb(15 23 42 / 16%);
  opacity: 0.96;
  clip-path: inset(0 round 6px);
  transform: translate(-120vw, -120vh);
}
</style>

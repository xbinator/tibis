<!--
  @file SidebarLayer.vue
  @description 画图页面侧边栏图层列表，展示画图元素图层项及选中态。
-->
<template>
  <BDraggable
    class="sidebar-panel__layer-list"
    :list="reversedElements"
    item-key="id"
    :item-class="getDraggableItemClass"
    handle-class="sidebar-panel__layer-drag-handle"
    @item-click="handleDraggableItemClick"
    @move="handleDraggableMove"
  >
    <template #default="{ item: element, handleClass }">
      <button type="button" :class="handleClass" aria-label="拖拽排序" @click.stop>
        <BIcon icon="lucide:grip-vertical" :size="14" />
      </button>
      <button type="button" class="sidebar-panel__layer-select" :aria-pressed="isElementSelected(element)">
        <BIcon :icon="getElementIcon(element)" :size="15" />
        <div class="sidebar-panel__layer-main">
          <span class="sidebar-panel__layer-title">{{ element.title }}</span>
        </div>
      </button>
      <div class="sidebar-panel__layer-actions">
        <BButton class="sidebar-panel__layer-action" type="text" size="mini" square icon="lucide:copy" @click.stop="handleElementCopy(element)" />
        <BButton class="sidebar-panel__layer-action" type="text" size="mini" danger square icon="lucide:trash-2" @click.stop="handleElementDelete(element)" />
      </div>
    </template>
  </BDraggable>
</template>

<script setup lang="ts">
import type { DrawingLayerMovePosition } from '../utils/layerOrder';
import { computed } from 'vue';
import type { BDraggableMoveEvent } from '@/components/BDraggable/types';
import type { DrawingElement } from '@/components/BDrawing/types';

/**
 * 图层列表入参。
 */
interface Props {
  /** 当前画图元素列表 */
  elements: DrawingElement[];
  /** 当前选中的画图元素 ID 列表 */
  selectedElementIds?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  selectedElementIds: (): string[] => []
});
const emit = defineEmits<{
  /** 选择图层元素 */
  'select-element': [element: DrawingElement];
  /** 复制图层元素 */
  'copy-element': [element: DrawingElement];
  /** 删除图层元素 */
  'delete-element': [element: DrawingElement];
  /** 移动画布图层元素 */
  'move-element': [sourceElementId: string, targetElementId: string, position: DrawingLayerMovePosition];
}>();

/** 当前选中元素 ID 集合。 */
const selectedElementIdSet = computed<Set<string>>(() => new Set(props.selectedElementIds));
/** 按画布层级从上到下展示的元素列表。 */
const reversedElements = computed<DrawingElement[]>(() => [...props.elements].reverse());

/**
 * 处理图层拖拽排序。
 * @param sourceElementId - 被移动元素 ID
 * @param targetElementId - 目标元素 ID
 * @param position - 基于侧栏视觉顺序的插入位置
 */
function handleElementMove(sourceElementId: string, targetElementId: string, position: DrawingLayerMovePosition): void {
  emit('move-element', sourceElementId, targetElementId, position);
}

/**
 * 读取图层图标。
 * @param element - 画图元素
 * @returns 图层图标名称
 */
function getElementIcon(element: DrawingElement): string {
  return element.icon;
}

/**
 * 判断图层元素是否处于选中态。
 * @param element - 画图元素
 * @returns 是否选中
 */
function isElementSelected(element: DrawingElement): boolean {
  return selectedElementIdSet.value.has(element.id);
}

/**
 * 生成公共拖拽列表项 class。
 * @param element - 图层元素
 * @returns 列表项 class 映射
 */
function getDraggableItemClass(element: DrawingElement): Record<string, boolean> {
  return {
    'sidebar-panel__layer-item': true,
    'is-active': isElementSelected(element)
  };
}

/**
 * 处理图层元素点击。
 * @param element - 被点击的画图元素
 */
function handleElementClick(element: DrawingElement): void {
  emit('select-element', element);
}

/**
 * 处理图层元素复制。
 * @param element - 被复制的画图元素
 */
function handleElementCopy(element: DrawingElement): void {
  emit('copy-element', element);
}

/**
 * 处理图层元素删除。
 * @param element - 被删除的画图元素
 */
function handleElementDelete(element: DrawingElement): void {
  emit('delete-element', element);
}

/**
 * 处理公共拖拽组件发出的列表项点击。
 * @param element - 被点击的画图元素
 */
function handleDraggableItemClick(element: DrawingElement): void {
  handleElementClick(element);
}

/**
 * 处理公共拖拽组件发出的移动事件。
 * @param event - 拖拽移动事件
 */
function handleDraggableMove(event: BDraggableMoveEvent<DrawingElement>): void {
  handleElementMove(event.sourceKey, event.targetKey, event.position);
}
</script>

<style lang="less" scoped>
.sidebar-panel__layer-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

:deep(.sidebar-panel__layer-item) {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 32px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: 6px;
  transition: all 0.16s ease;
}

:deep(.sidebar-panel__layer-item.is-active) {
  color: var(--color-primary);
  background: var(--color-primary-bg);
  border-color: var(--color-primary-border);
}

:deep(.sidebar-panel__layer-item.is-active .sidebar-panel__layer-title) {
  color: var(--color-primary);
}

:deep(.sidebar-panel__layer-item.is-dragging) {
  opacity: 0.55;
}

:deep(.sidebar-panel__layer-item.is-active.is-dragging) {
  border-color: transparent;
}

.sidebar-panel__layer-drag-handle {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 100%;
  padding: 0;
  color: var(--text-secondary);
  appearance: none;
  cursor: grab;
  background: transparent;
  border: 0;
  opacity: 0.72;
  transition: all 0.16s ease;
}

.sidebar-panel__layer-drag-handle:hover,
.sidebar-panel__layer-drag-handle:focus-visible {
  color: var(--color-primary);
  opacity: 1;
}

:deep(.sidebar-panel__layer-item.is-dragging .sidebar-panel__layer-drag-handle) {
  cursor: grabbing;
}

.sidebar-panel__layer-select {
  display: flex;
  flex: 1;
  gap: 9px;
  align-items: center;
  min-width: 0;
  height: 100%;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  appearance: none;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.sidebar-panel__layer-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.sidebar-panel__layer-title {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.sidebar-panel__layer-actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  align-items: center;
  padding-right: 4px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.16s ease;
}

:deep(.sidebar-panel__layer-item:hover .sidebar-panel__layer-actions),
:deep(.sidebar-panel__layer-item:focus-within .sidebar-panel__layer-actions) {
  pointer-events: auto;
  opacity: 1;
}
</style>

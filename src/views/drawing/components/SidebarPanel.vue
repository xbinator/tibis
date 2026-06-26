<!--
  @file SidebarPanel.vue
  @description 画图页面左侧工具与图层侧边栏。
-->
<template>
  <aside class="sidebar-panel">
    <div class="sidebar__tabs">
      <template v-for="tab in sidebarTabs" :key="tab.key">
        <BButton :type="activeSidebarTab === tab.key ? 'secondary' : 'ghost'" square :icon="tab.icon" @click="handleTabClick(tab.key)" />
      </template>
    </div>

    <div class="sidebar-panel__content">
      <header class="sidebar-panel__panel-header">
        <h2 class="sidebar-panel__panel-title">{{ activePanelTitle }}</h2>
      </header>

      <div class="sidebar-panel__panel-content">
        <div v-if="activeSidebarTab === 'tools'" class="sidebar-panel__tool-grid">
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

        <div v-else-if="elements.length" class="sidebar-panel__layer-list">
          <div v-for="element in elements" :key="element.id" class="sidebar-panel__layer-item" :class="{ 'is-active': isElementSelected(element) }">
            <BIcon :icon="getElementIcon(element)" :size="15" />
            <div class="sidebar-panel__layer-main">
              <span class="sidebar-panel__layer-title">{{ element.title }}</span>
            </div>
          </div>
        </div>
        <div v-else class="sidebar-panel__empty">暂无图层</div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { DRAWING_ELEMENT_SCHEMAS } from '@/components/BDrawing/elements';
import type { DrawingElementSchema } from '@/components/BDrawing/elements';
import type { DrawingElement } from '@/components/BDrawing/types';
import { setDrawingElementDragData } from '../utils/drag';

/**
 * 左侧侧边栏页签类型。
 */
type DrawingSidebarTabKey = 'tools' | 'layers';

/**
 * 左侧侧边栏页签配置。
 */
interface DrawingSidebarTab {
  /** 页签标识 */
  key: DrawingSidebarTabKey;
  /** 页签显示名称 */
  label: string;
  /** 页签图标 */
  icon: string;
}

/**
 * 画图侧边栏入参。
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

const activeSidebarTab = ref<DrawingSidebarTabKey>('tools');
/** 当前面板标题。 */
const activePanelTitle = computed<string>(() => (activeSidebarTab.value === 'tools' ? '组件' : '图层'));
/** 当前选中元素 ID 集合。 */
const selectedElementIdSet = computed<Set<string>>(() => new Set(props.selectedElementIds));
/** 左侧侧边栏页签列表。 */
const sidebarTabs: DrawingSidebarTab[] = [
  { key: 'tools', label: '组件', icon: 'lucide:box' },
  { key: 'layers', label: '图层', icon: 'lucide:layers' }
];
/** 当前可创建元素列表。 */
const drawingElementSchemas = DRAWING_ELEMENT_SCHEMAS;
/** 当前拖拽工具的自定义预览节点。 */
let toolDragPreviewElement: HTMLElement | null = null;

/**
 * 切换左侧侧边栏页签。
 * @param key - 目标页签标识
 */
function handleTabClick(key: DrawingSidebarTabKey): void {
  activeSidebarTab.value = key;
}

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
</script>

<style lang="less" scoped>
.sidebar-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-shrink: 0;
  width: 320px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-shadow: 1px 0 0 0 var(--border-primary);
}

.sidebar__tabs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 6px;
  box-shadow: 1px 0 0 var(--border-primary);
}

.sidebar-panel__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.sidebar-panel__panel-content {
  padding: 12px;
}

.sidebar-panel__panel-header {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
  height: 38px;
  padding: 0 12px;
  box-shadow: 0 1px 0 0 var(--border-primary);
}

.sidebar-panel__panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

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

.sidebar-panel__layer-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow: auto;
}

.sidebar-panel__layer-item {
  display: flex;
  gap: 9px;
  align-items: center;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: 6px;
  transition: all 0.16s ease;
}

.sidebar-panel__layer-item.is-active {
  color: var(--color-primary);
  background: var(--color-primary-bg);
  border-color: var(--color-primary-border);
}

.sidebar-panel__layer-item.is-active .sidebar-panel__layer-title {
  color: var(--color-primary);
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

.sidebar-panel__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-tertiary);
}
</style>

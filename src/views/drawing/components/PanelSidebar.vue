<!--
  @file PanelSidebar.vue
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
        <SidebarTools v-if="activeSidebarTab === 'tools'" />
        <SidebarLayer
          v-else-if="elements.length"
          :active-element-id="activeElementId"
          :elements="elements"
          :selected-element-ids="selectedElementIds"
          @select-element="handleElementSelect"
          @select-elements="handleElementsSelect"
          @copy-element="handleElementCopy"
          @copy-elements="handleElementsCopy"
          @delete-element="handleElementDelete"
          @delete-elements="handleElementsDelete"
          @move-element="handleElementMove"
          @move-elements="handleElementsMove"
        />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { DrawingLayerMovePosition } from '../utils/layerOrder';
import { computed, ref } from 'vue';
import type { DrawingElement } from '@/components/BDrawing/types';
import SidebarLayer from './SidebarLayer.vue';
import SidebarTools from './SidebarTools.vue';

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
  /** 组合选区内当前编辑的元素 ID */
  activeElementId?: string | null;
  /** 当前画图元素列表 */
  elements: DrawingElement[];
  /** 当前选中的画图元素 ID 列表 */
  selectedElementIds?: string[];
}

withDefaults(defineProps<Props>(), {
  activeElementId: null,
  selectedElementIds: (): string[] => []
});
const emit = defineEmits<{
  /** 选择侧栏图层元素 */
  'select-element': [element: DrawingElement];
  /** 选择多个侧栏图层元素 */
  'select-elements': [elements: DrawingElement[]];
  /** 复制侧栏图层元素 */
  'copy-element': [element: DrawingElement];
  /** 复制多个侧栏图层元素 */
  'copy-elements': [elements: DrawingElement[]];
  /** 删除侧栏图层元素 */
  'delete-element': [element: DrawingElement];
  /** 删除多个侧栏图层元素 */
  'delete-elements': [elements: DrawingElement[]];
  /** 移动侧栏图层元素 */
  'move-element': [sourceElementId: string, targetElementId: string, position: DrawingLayerMovePosition];
  /** 移动多个侧栏图层元素 */
  'move-elements': [sourceElementIds: string[], targetElementIds: string[], position: DrawingLayerMovePosition];
}>();

const activeSidebarTab = ref<DrawingSidebarTabKey>('tools');
/** 当前面板标题。 */
const activePanelTitle = computed<string>(() => (activeSidebarTab.value === 'tools' ? '组件' : '图层'));
/** 左侧侧边栏页签列表。 */
const sidebarTabs: DrawingSidebarTab[] = [
  { key: 'tools', label: '组件', icon: 'lucide:box' },
  { key: 'layers', label: '图层', icon: 'lucide:layers' }
];

/**
 * 切换左侧侧边栏页签。
 * @param key - 目标页签标识
 */
function handleTabClick(key: DrawingSidebarTabKey): void {
  activeSidebarTab.value = key;
}

/**
 * 处理图层列表选择。
 * @param element - 被选择的画图元素
 */
function handleElementSelect(element: DrawingElement): void {
  emit('select-element', element);
}

/**
 * 处理图层列表多选。
 * @param elements - 被选择的画图元素
 */
function handleElementsSelect(elements: DrawingElement[]): void {
  emit('select-elements', elements);
}

/**
 * 处理图层列表复制。
 * @param element - 被复制的画图元素
 */
function handleElementCopy(element: DrawingElement): void {
  emit('copy-element', element);
}

/**
 * 处理图层列表多元素复制。
 * @param elements - 被复制的画图元素
 */
function handleElementsCopy(elements: DrawingElement[]): void {
  emit('copy-elements', elements);
}

/**
 * 处理图层列表删除。
 * @param element - 被删除的画图元素
 */
function handleElementDelete(element: DrawingElement): void {
  emit('delete-element', element);
}

/**
 * 处理图层列表多元素删除。
 * @param elements - 被删除的画图元素
 */
function handleElementsDelete(elements: DrawingElement[]): void {
  emit('delete-elements', elements);
}

/**
 * 处理图层列表拖拽排序。
 * @param sourceElementId - 被移动元素 ID
 * @param targetElementId - 目标元素 ID
 * @param position - 基于侧栏视觉顺序的插入位置
 */
function handleElementMove(sourceElementId: string, targetElementId: string, position: DrawingLayerMovePosition): void {
  emit('move-element', sourceElementId, targetElementId, position);
}

/**
 * 处理图层列表多元素拖拽排序。
 * @param sourceElementIds - 被移动元素 ID 列表
 * @param targetElementIds - 目标元素 ID 列表
 * @param position - 基于侧栏视觉顺序的插入位置
 */
function handleElementsMove(sourceElementIds: string[], targetElementIds: string[], position: DrawingLayerMovePosition): void {
  emit('move-elements', sourceElementIds, targetElementIds, position);
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
  height: 100%;
  padding: 12px;
  overflow: auto;
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
</style>

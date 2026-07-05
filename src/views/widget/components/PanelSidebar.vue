<!--
  @file PanelSidebar.vue
  @description Widget页面左侧工具与图层侧边栏，tabs 列常驻显示，splitter 包裹内容区控制折叠；splitter 关闭后保留当前 tab 选中态，再次点击 tab 自动重新展开并定位。
-->
<template>
  <aside class="sidebar-panel">
    <div class="sidebar__tabs">
      <template v-for="tab in sidebarTabs" :key="tab.key">
        <BButton :type="activeSidebarTab === tab.key ? 'secondary' : 'ghost'" square :icon="tab.icon" @click="handleTabClick(tab.key)" />
      </template>
    </div>

    <BPanelSplitter v-model:size="size" position="right" :min-width="200" :max-width="300">
      <div class="sidebar-panel__content">
        <header class="sidebar-panel__panel-header">
          <h2 class="sidebar-panel__panel-title">{{ activePanelTitle }}</h2>
        </header>

        <div class="sidebar-panel__panel-content">
          <SidebarTools v-if="activeSidebarTab === 'tools'" />
          <SidebarLayer
            v-else-if="activeSidebarTab === 'layers'"
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
    </BPanelSplitter>
  </aside>
</template>

<script setup lang="ts">
import type { WidgetLayerMovePosition } from '../utils/layerOrder';
import { computed, ref } from 'vue';
import type { WidgetElement } from '@/components/BWidget/types';
import SidebarLayer from './SidebarLayer.vue';
import SidebarTools from './SidebarTools.vue';

/**
 * 左侧侧边栏页签类型。
 */
type WidgetSidebarTabKey = 'tools' | 'layers';

/**
 * 当前激活的左侧侧边栏页签。
 */
type ActiveWidgetSidebarTabKey = WidgetSidebarTabKey | null;

/**
 * 左侧侧边栏页签配置。
 */
interface WidgetSidebarTab {
  /** 页签标识 */
  key: WidgetSidebarTabKey;
  /** 页签显示名称 */
  label: string;
  /** 页签图标 */
  icon: string;
}

/**
 * Widget侧边栏入参。
 */
interface Props {
  /** 组合选区内当前编辑的元素 ID */
  activeElementId?: string | null;
  /** 当前Widget元素列表 */
  elements: WidgetElement[];
  /** 当前选中的Widget元素 ID 列表 */
  selectedElementIds?: string[];
}

withDefaults(defineProps<Props>(), {
  activeElementId: null,
  selectedElementIds: (): string[] => []
});

/** 内容区默认宽度；侧栏关闭后点击 tab 时恢复到该值。 */
const SIDEBAR_DEFAULT_SIZE = 240;

/** 内容区宽度（内部状态），为 0 时表示侧栏已关闭。 */
const size = ref(SIDEBAR_DEFAULT_SIZE);

const emit = defineEmits<{
  /** 选择侧栏图层元素 */
  'select-element': [element: WidgetElement];
  /** 选择多个侧栏图层元素 */
  'select-elements': [elements: WidgetElement[]];
  /** 复制侧栏图层元素 */
  'copy-element': [element: WidgetElement];
  /** 复制多个侧栏图层元素 */
  'copy-elements': [elements: WidgetElement[]];
  /** 删除侧栏图层元素 */
  'delete-element': [element: WidgetElement];
  /** 删除多个侧栏图层元素 */
  'delete-elements': [elements: WidgetElement[]];
  /** 移动侧栏图层元素 */
  'move-element': [sourceElementId: string, targetElementId: string, position: WidgetLayerMovePosition];
  /** 移动多个侧栏图层元素 */
  'move-elements': [sourceElementIds: string[], targetElementIds: string[], position: WidgetLayerMovePosition];
}>();

const activeSidebarTab = ref<ActiveWidgetSidebarTabKey>('tools');
/** 当前面板标题。 */
const activePanelTitle = computed<string>((): string => {
  if (activeSidebarTab.value === 'tools') {
    return '组件';
  }

  if (activeSidebarTab.value === 'layers') {
    return '图层';
  }

  return '';
});
/** 左侧侧边栏页签列表。 */
const sidebarTabs: WidgetSidebarTab[] = [
  { key: 'tools', label: '组件', icon: 'lucide:box' },
  { key: 'layers', label: '图层', icon: 'lucide:layers' }
];

/**
 * 切换左侧侧边栏页签。
 *
 * - 正常态（size > 0）：仅切换 tab
 * - 关闭态（size = 0）：先恢复默认宽度，再切换 tab
 * @param key - 目标页签标识
 */
function handleTabClick(key: WidgetSidebarTabKey): void {
  if (size.value <= 0) {
    size.value = SIDEBAR_DEFAULT_SIZE;
  }

  activeSidebarTab.value = key;
}

/**
 * 处理图层列表选择。
 * @param element - 被选择的Widget元素
 */
function handleElementSelect(element: WidgetElement): void {
  emit('select-element', element);
}

/**
 * 处理图层列表多选。
 * @param elements - 被选择的Widget元素
 */
function handleElementsSelect(elements: WidgetElement[]): void {
  emit('select-elements', elements);
}

/**
 * 处理图层列表复制。
 * @param element - 被复制的Widget元素
 */
function handleElementCopy(element: WidgetElement): void {
  emit('copy-element', element);
}

/**
 * 处理图层列表多元素复制。
 * @param elements - 被复制的Widget元素
 */
function handleElementsCopy(elements: WidgetElement[]): void {
  emit('copy-elements', elements);
}

/**
 * 处理图层列表删除。
 * @param element - 被删除的Widget元素
 */
function handleElementDelete(element: WidgetElement): void {
  emit('delete-element', element);
}

/**
 * 处理图层列表多元素删除。
 * @param elements - 被删除的Widget元素
 */
function handleElementsDelete(elements: WidgetElement[]): void {
  emit('delete-elements', elements);
}

/**
 * 处理图层列表拖拽排序。
 * @param sourceElementId - 被移动元素 ID
 * @param targetElementId - 目标元素 ID
 * @param position - 基于侧栏视觉顺序的插入位置
 */
function handleElementMove(sourceElementId: string, targetElementId: string, position: WidgetLayerMovePosition): void {
  emit('move-element', sourceElementId, targetElementId, position);
}

/**
 * 处理图层列表多元素拖拽排序。
 * @param sourceElementIds - 被移动元素 ID 列表
 * @param targetElementIds - 目标元素 ID 列表
 * @param position - 基于侧栏视觉顺序的插入位置
 */
function handleElementsMove(sourceElementIds: string[], targetElementIds: string[], position: WidgetLayerMovePosition): void {
  emit('move-elements', sourceElementIds, targetElementIds, position);
}
</script>

<style lang="less" scoped>
.sidebar-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
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
  overflow: hidden;
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

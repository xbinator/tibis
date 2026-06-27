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
        <SidebarLayer v-else-if="elements.length" :elements="elements" :selected-element-ids="selectedElementIds" @select-element="handleElementSelect" />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
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
  /** 当前画图元素列表 */
  elements: DrawingElement[];
  /** 当前选中的画图元素 ID 列表 */
  selectedElementIds?: string[];
}

withDefaults(defineProps<Props>(), {
  selectedElementIds: (): string[] => []
});
const emit = defineEmits<{
  /** 选择侧栏图层元素 */
  'select-element': [element: DrawingElement];
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
</style>

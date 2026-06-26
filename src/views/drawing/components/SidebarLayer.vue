<!--
  @file SidebarLayer.vue
  @description 画图页面侧边栏图层列表，展示画图元素图层项及选中态。
-->
<template>
  <div class="sidebar-panel__layer-list">
    <div v-for="element in elements" :key="element.id" class="sidebar-panel__layer-item" :class="{ 'is-active': isElementSelected(element) }">
      <BIcon :icon="getElementIcon(element)" :size="15" />
      <div class="sidebar-panel__layer-main">
        <span class="sidebar-panel__layer-title">{{ element.title }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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

/** 当前选中元素 ID 集合。 */
const selectedElementIdSet = computed<Set<string>>(() => new Set(props.selectedElementIds));

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
</style>

<!--
  @file SidebarTools.vue
  @description Widget页面侧边栏工具网格，展示可拖拽的Widget元素工具项。
-->
<template>
  <SidebarPanel title="组件">
    <div class="sidebar-panel__tool-grid">
      <div
        v-for="schema in widgetElementSchemas"
        :key="schema.name"
        class="sidebar-panel__tool-item"
        @pointerdown.left.prevent="handleToolPointerdown(schema, $event)"
      >
        <BIcon :icon="schema.icon" :size="16" />
        <span>{{ schema.label }}</span>
      </div>
    </div>
  </SidebarPanel>
</template>

<script setup lang="ts">
import { WIDGET_ELEMENT_SCHEMAS, type WidgetElementSchema } from '@/components/BWidget/elements';
import { useDraggerController } from '../hooks/useDragger';
import SidebarPanel from './_SidebarPanel.vue';

const emit = defineEmits<{
  /** 开始拖拽创建 Widget 元素 */
  'drag-start': [];
}>();

/** 当前可创建元素列表。 */
const widgetElementSchemas = WIDGET_ELEMENT_SCHEMAS;
/** 元素拖拽控制器。 */
const elementDrag = useDraggerController();

/**
 * 处理工具项指针按下，启动自定义拖拽并通知父级临时收起侧栏内容区。
 * @param schema - 被拖拽的 Widget 元素工具
 * @param event - 指针事件
 */
function handleToolPointerdown(schema: WidgetElementSchema, event: PointerEvent): void {
  elementDrag.startDrag(schema, event);
  emit('drag-start');
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
</style>

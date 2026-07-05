<!--
  @file _SidebarPanel.vue
  @description Widget 侧边栏通用面板骨架，承载 header（标题 + 可选 help 装饰 / 右侧操作区）和内容区。
-->
<template>
  <div class="sidebar-panel">
    <header class="sidebar-panel__header">
      <div v-if="title || $slots.help" class="sidebar-panel__title-group">
        <h2 v-if="title" class="sidebar-panel__title">{{ title }}</h2>
        <div v-if="$slots.help" class="sidebar-panel__help" @click.stop>
          <slot name="help"></slot>
        </div>
      </div>
      <div v-if="$slots.extra" class="sidebar-panel__extra">
        <slot name="extra"></slot>
      </div>
    </header>
    <div class="sidebar-panel__content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SidebarPanel 组件 props 定义。
 */
interface Props {
  /** 面板标题，未提供时仍可仅渲染 help 装饰 / extra 操作区。 */
  title?: string;
}

defineOptions({ name: 'SidebarPanel' });

withDefaults(defineProps<Props>(), {
  title: ''
});
</script>

<style lang="less" scoped>
.sidebar-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.sidebar-panel__header {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
  height: 38px;
  padding: 0 12px;
  box-shadow: 0 1px 0 0 var(--border-primary);
}

.sidebar-panel__title-group {
  display: flex;
  flex: 1;
  gap: 4px;
  align-items: center;
  min-width: 0;
}

.sidebar-panel__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-panel__help {
  display: flex;
  align-items: center;
  color: var(--text-tertiary);
}

.sidebar-panel__extra {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  align-items: center;
}

.sidebar-panel__content {
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow: auto;
}
</style>

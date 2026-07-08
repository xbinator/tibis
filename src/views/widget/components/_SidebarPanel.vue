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
    <div class="sidebar-panel__content" :style="{ padding }">
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
  /** 内容区内边距，支持任意 CSS 长度 / 简写；数字会被视作 px。 */
  padding?: string | number;
}

defineOptions({ name: 'SidebarPanel' });

withDefaults(defineProps<Props>(), {
  title: '',
  padding: '12px'
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
  height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-primary);
}

.sidebar-panel__title-group {
  display: flex;
  flex: 1;
  gap: 8px;
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

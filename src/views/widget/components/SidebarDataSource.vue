<!--
  @file SidebarDataSource.vue
  @description Widget页面侧边栏数据源面板骨架，后续承载数据源管理功能。
-->
<template>
  <div class="sidebar-panel__data-source-empty">
    <div class="sidebar-panel__data-source-empty-icon">
      <BIcon icon="lucide:database" :size="24" />
    </div>
    <span class="sidebar-panel__data-source-empty-text">还没有数据源</span>
    <span class="sidebar-panel__data-source-empty-hint">数据源将在此展示</span>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SidebarDataSource' });
</script>

<style lang="less" scoped>
.sidebar-panel__data-source-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
}

.sidebar-panel__data-source-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 4px;
  color: var(--text-quaternary);
  background: var(--bg-tertiary);
  border-radius: 12px;
}

.sidebar-panel__data-source-empty-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.sidebar-panel__data-source-empty-hint {
  font-size: 12px;
  color: var(--text-quaternary);
}
</style>

<!--
  @file SidebarAction.vue
  @description Widget页面侧边栏动作面板骨架，后续承载运行时动作管理功能。
-->
<template>
  <SidebarPanel title="动作">
    <div class="sidebar-panel__action-empty">
      <div class="sidebar-panel__action-empty-icon">
        <BIcon icon="lucide:zap" :size="24" />
      </div>
      <span class="sidebar-panel__action-empty-text">还没有动作</span>
      <span class="sidebar-panel__action-empty-hint">动作将在此展示</span>
    </div>
  </SidebarPanel>
</template>

<script setup lang="ts">
import SidebarPanel from './_SidebarPanel.vue';

defineOptions({ name: 'SidebarAction' });
</script>

<style lang="less" scoped>
.sidebar-panel__action-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
}

.sidebar-panel__action-empty-icon {
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

.sidebar-panel__action-empty-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.sidebar-panel__action-empty-hint {
  font-size: 12px;
  color: var(--text-quaternary);
}
</style>

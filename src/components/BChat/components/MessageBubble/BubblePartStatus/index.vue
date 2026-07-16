<!--
  @file BubblePartStatus.vue
  @description 聊天气泡状态片段，展示中断状态节点。
-->
<template>
  <div class="status-node status-node--cancelled">
    <div class="status-node__rail">
      <span class="status-node__line"></span>
      <span class="status-node__pill">已中断</span>
      <span class="status-node__line"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file BubblePartStatus.vue
 * @description 聊天气泡状态片段，展示中断状态节点。
 */
defineOptions({ name: 'BubblePartStatus' });
</script>

<style scoped lang="less">
.status-node {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 6px 0;
}

.status-node__rail {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.status-node__line {
  flex: 1;
  height: 1px;
  background: var(--border-primary);
  opacity: 0.75;
}

.status-node__pill {
  padding: 4px 10px;
  font-size: 11px;
  line-height: 1;
  color: var(--text-tertiary);
  background: var(--bg-hover);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
}
</style>

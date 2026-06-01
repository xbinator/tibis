<!--
  @file MemoryContent.vue
  @description 记忆内容只读展示组件，按分区展示记忆条目。
-->
<template>
  <div class="memory-content">
    <pre class="memory-settings__pre">{{ content }}</pre>
  </div>
</template>

<script setup lang="ts">
/**
 * @file MemoryContent.vue
 * @description 记忆内容只读展示组件，按分区展示记忆条目。
 */

/**
 * 组件 props
 */
interface Props {
  /** 要展示的记忆内容 */
  content: string;
}

defineProps<Props>();
</script>

<style scoped lang="less">
.memory-content {
  margin: 12px 16px;
}

.memory-settings__pre {
  padding: 12px 16px;
  margin: 0;
  font-family: 'Fira Code', 'JetBrains Mono', Consolas, Monaco, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  word-break: break-all;
  white-space: pre-wrap;
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
}
</style>

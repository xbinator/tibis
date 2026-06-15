<!--
  @file BubblePartCompression.vue
  @description 压缩消息片段，展示上下文压缩边界状态节点。
-->
<template>
  <div class="compression-node" :class="`compression-node--${statusClassName}`">
    <div class="compression-node__rail">
      <span class="compression-node__line"></span>
      <span class="compression-node__pill">{{ statusLabel }}</span>
      <span class="compression-node__line"></span>
    </div>
    <div v-if="errorText" class="compression-node__error">{{ errorText }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file BubblePartCompression.vue
 * @description 压缩消息片段，展示上下文压缩边界状态节点。
 */
import type { Message } from '../../utils/types';
import { computed } from 'vue';

/**
 * 组件属性。
 */
interface Props {
  /** 压缩消息 */
  message: Message;
}

const props = defineProps<Props>();

/**
 * 压缩状态文案。
 */
const statusLabel = computed<string>(() => {
  if (props.message.role === 'interrupt') {
    return '已中断';
  }

  if (props.message.compression?.status === 'pending') {
    return '正在压缩上下文';
  }

  if (props.message.compression?.status === 'cancelled') {
    return '压缩已取消';
  }

  if (props.message.compression?.status === 'failed') {
    return '压缩失败';
  }

  return '上下文已压缩';
});

/**
 * 压缩状态样式类名。
 */
const statusClassName = computed<string>(() => {
  if (props.message.role === 'interrupt') {
    return 'cancelled';
  }

  return props.message.compression?.status ?? 'success';
});

/**
 * 压缩失败错误信息。
 */
const errorText = computed<string | undefined>(() => {
  return props.message.compression?.status === 'failed' ? props.message.compression.errorMessage : undefined;
});
</script>

<style scoped lang="less">
.compression-node {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 6px 0;
}

.compression-node__rail {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.compression-node__line {
  flex: 1;
  height: 1px;
  background: var(--border-primary);
  opacity: 0.75;
}

.compression-node__pill {
  padding: 4px 10px;
  font-size: 11px;
  line-height: 1;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
}

.compression-node__error {
  max-width: 420px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-error);
  text-align: center;
}

.compression-node--pending {
  .compression-node__pill {
    color: var(--text-primary);
  }
}

.compression-node--cancelled {
  .compression-node__pill {
    color: var(--text-tertiary);
    background: var(--bg-hover);
    border-color: var(--border-primary);
  }
}

.compression-node--failed {
  .compression-node__pill {
    color: var(--color-warning);
    background: var(--color-warning-bg);
    border-color: var(--color-warning-border);
  }
}
</style>

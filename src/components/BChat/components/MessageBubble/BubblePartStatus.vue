<!--
  @file BubblePartStatus.vue
  @description 聊天气泡状态片段，展示上下文压缩或中断状态节点。
-->
<template>
  <div class="status-node" :class="`status-node--${statusClassName}`">
    <div class="status-node__rail">
      <span class="status-node__line"></span>
      <span class="status-node__pill">{{ statusLabel }}</span>
      <span class="status-node__line"></span>
    </div>
    <div v-if="errorText" class="status-node__error">{{ errorText }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file BubblePartStatus.vue
 * @description 聊天气泡状态片段，展示上下文压缩或中断状态节点。
 */
import type { Message } from '../../utils/types';
import { computed } from 'vue';

/**
 * 组件属性。
 */
interface Props {
  /** 状态消息 */
  message: Message;
}

defineOptions({ name: 'BubblePartStatus' });

const props = defineProps<Props>();

/**
 * 状态文案。
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
 * 状态样式类名。
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
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
}

.status-node__error {
  max-width: 420px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-error);
  text-align: center;
}

.status-node--pending {
  .status-node__pill {
    color: var(--text-primary);
  }
}

.status-node--cancelled {
  .status-node__pill {
    color: var(--text-tertiary);
    background: var(--bg-hover);
    border-color: var(--border-primary);
  }
}

.status-node--failed {
  .status-node__pill {
    color: var(--color-warning);
    background: var(--color-warning-bg);
    border-color: var(--color-warning-border);
  }
}
</style>

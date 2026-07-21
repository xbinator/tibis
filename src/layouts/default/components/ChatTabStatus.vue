<!--
  @file ChatTabStatus.vue
  @description 通过声明式配置渲染聊天标签运行状态。
-->
<template>
  <span v-if="visual" :class="['header-tab__chat-status', visual.className]" :data-chat-status="status">
    <Icon v-if="visual.icon" :icon="visual.icon" width="13" height="13" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { ChatTabRuntimeStatus } from '@/stores/chat/tabRuntime';

/**
 * 聊天标签状态组件属性。
 */
interface Props {
  /** 当前可视状态；空值不渲染状态节点。 */
  status: ChatTabRuntimeStatus | null;
}

/**
 * 单个聊天状态的图标和样式配置。
 */
interface ChatStatusVisual {
  /** 可选 Iconify 图标。 */
  icon?: string;
  /** 状态附加类名。 */
  className?: string;
}

/** 非空闲聊天状态的声明式视觉映射。 */
const CHAT_STATUS_VISUALS: Partial<Record<ChatTabRuntimeStatus, ChatStatusVisual>> = {
  running: { icon: 'lucide:loader-circle', className: 'is-spinning' },
  waiting: { icon: 'lucide:circle-alert', className: 'header-tab__chat-status--waiting' },
  error: { icon: 'lucide:circle-x', className: 'header-tab__chat-status--error' },
  completed: { className: 'header-tab__chat-status--completed' }
};

const props = defineProps<Props>();
/** 当前状态对应的视觉配置。 */
const visual = computed<ChatStatusVisual | undefined>((): ChatStatusVisual | undefined => (props.status ? CHAT_STATUS_VISUALS[props.status] : undefined));
</script>

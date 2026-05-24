<template>
  <BubblePart type="tool-activity" has-content :default-collapsed="false">
    <template #title>
      <Icon :icon="iconName" width="14" height="14" :class="bem('icon', { running })" />
      <span :class="bem('title')">{{ title }}</span>
      <span v-if="statusText" :class="bem('status', { failure: isFailure })">{{ statusText }}</span>
    </template>

    <div :class="bem('summary')">{{ summaryText }}</div>
  </BubblePart>
</template>

<script setup lang="ts">
/**
 * @file BubblePartToolActivity.vue
 * @description 聊天工具活动摘要组件，将内部工具调用转换为用户可理解的进度与结果。
 */
import type { ChatMessageToolCallPart, ChatMessageToolInputPart, ChatMessageToolResultPart } from 'types/chat';
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { createNamespace } from '@/utils/namespace';
import BubblePart from './BubblePart.vue';

defineOptions({ name: 'BubblePartToolActivity' });

/** 可展示为工具活动摘要的消息片段。 */
type ToolActivityPart = ChatMessageToolInputPart | ChatMessageToolCallPart | ChatMessageToolResultPart;

interface Props {
  /** 工具活动片段 */
  part: ToolActivityPart;
}

const props = defineProps<Props>();
const [, bem] = createNamespace('', 'message-bubble-tool-activity');

/** 内置工具对应的用户可读动作文案。 */
const TOOL_ACTION_LABELS: Record<string, { running: string; success: string }> = {
  read_file: { running: '正在读取文件', success: '文件读取完成' },
  write_file: { running: '正在写入文件', success: '文件写入完成' },
  edit_file: { running: '正在修改文件', success: '文件修改完成' },
  list_files: { running: '正在查看文件列表', success: '文件列表已获取' },
  search_files: { running: '正在搜索文件', success: '文件搜索完成' },
  open_draft: { running: '正在打开草稿', success: '草稿已打开' },
  tavily_search: { running: '正在搜索网页', success: '网页搜索完成' }
};

/**
 * 获取工具对应的用户可读动作。
 * @param toolName - 内部工具名称
 * @returns 用户可读动作文案
 */
function getActionLabel(toolName: string): { running: string; success: string } {
  return TOOL_ACTION_LABELS[toolName] ?? { running: '正在处理请求', success: '操作已完成' };
}

/** 当前执行结果片段。 */
const resultPart = computed<ChatMessageToolResultPart | null>(() => (props.part.type === 'tool-result' ? props.part : null));
/** 当前工具动作文案。 */
const actionLabel = computed(() => getActionLabel(props.part.toolName));
/** 工具是否仍在进行中。 */
const running = computed(() => props.part.type !== 'tool-result');
/** 工具是否失败或取消。 */
const isFailure = computed(() => Boolean(resultPart.value && resultPart.value.result.status !== 'success'));
/** 标题文案。 */
const title = computed(() => {
  const result = resultPart.value?.result;
  if (!result) {
    return actionLabel.value.running;
  }

  if (result.status === 'success') {
    return actionLabel.value.success;
  }

  if (result.status === 'cancelled') {
    return '操作已取消';
  }

  return '操作未完成';
});
/** 状态标签文案。 */
const statusText = computed(() => {
  const result = resultPart.value?.result;
  if (!result) {
    return '';
  }

  if (result.status === 'success') {
    return '已完成';
  }

  if (result.status === 'cancelled') {
    return '已取消';
  }

  return '失败';
});
/** 内容摘要文案。 */
const summaryText = computed(() => {
  const result = resultPart.value?.result;
  if (!result) {
    return '正在执行相关操作，请稍候。';
  }

  if (result.status === 'success') {
    return '已完成。';
  }

  return result.error?.message ?? '等待补充信息。';
});
/** 图标名称。 */
const iconName = computed(() => {
  const result = resultPart.value?.result;
  if (!result) {
    return 'lucide:loader-circle';
  }

  return result.status === 'success' ? 'lucide:check-circle-2' : 'lucide:circle-alert';
});
</script>

<style scoped lang="less">
.message-bubble-tool-activity__icon--running {
  animation: message-bubble-tool-activity-spin 1.2s linear infinite;
}

.message-bubble-tool-activity__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-bubble-tool-activity__status {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.message-bubble-tool-activity__status--failure {
  color: var(--color-error);
}

.message-bubble-tool-activity__summary {
  line-height: 1.6;
  color: var(--text-secondary);
}

@keyframes message-bubble-tool-activity-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>

<template>
  <BubblePart type="tool" :has-content="hasContent" :default-collapsed="defaultCollapsed">
    <template #title>
      <Icon :icon="icon" :class="bem('icon', { spin: part.status === 'inputting' })" width="14" height="14" />
      <BTruncateText :class="bem('name')" :text="title" />
      <span v-if="part.status === 'done' && part.result?.status === 'failure'" :class="bem('status', { failure: true })">失败</span>
    </template>

    <BubblePartToolCode v-if="hasContent" :value="previewValue" />
  </BubblePart>
</template>

<script setup lang="ts">
/**
 * @file BubblePartTool.vue
 * @description 聊天工具统一片段组件，根据 status 切换 inputting/executing/done 三种视图。
 */
import type { ChatMessageToolPart } from 'types/chat';
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { createNamespace } from '@/utils/namespace';
import { hasStructuredValueContent } from '../../utils/messagePart';
import { getActionLabel } from '../../utils/toolLabels';
import BubblePart from './BubblePart.vue';
import BubblePartToolCode from './BubblePartToolCode.vue';

defineOptions({ name: 'BubblePartTool' });

interface Props {
  // 工具片段
  part: ChatMessageToolPart;
}

const props = withDefaults(defineProps<Props>(), {});

const [, bem] = createNamespace('', 'bubble-part-tool');

// 图标映射表（提取为模块常量，避免每次渲染重建）
const ICON_MAP = {
  inputting: 'lucide:loader-circle',
  executing: 'lucide:wrench',
  done: {
    success: 'lucide:check-circle-2',
    failure: 'lucide:circle-alert'
  }
} as const;

const icon = computed(() => {
  const { status } = props.part;
  if (status === 'done') {
    return ICON_MAP.done[(props.part.result?.status as keyof typeof ICON_MAP.done) ?? 'failure'];
  }
  return ICON_MAP[status];
});

/** 默认折叠：inputting 不折叠，其余折叠 */
const defaultCollapsed = computed(() => props.part.status !== 'inputting');

/** 标题文案 */
const title = computed(() => {
  const { part } = props;
  const { alias } = getActionLabel(part.toolName);

  if (part.toolName === 'write_file' || part.toolName === 'edit_file') {
    const path = (part.input as Record<string, unknown>)?.path;
    if (typeof path === 'string') return path;
  }

  return alias;
});

/** inputting 状态下的预览值 */
function getInputtingValue(part: ChatMessageToolPart) {
  const { content } = part.input as { content: string };
  // 写入文件工具，预览内容为 content
  if (part.toolName === 'write_file' && typeof content !== 'undefined') return content;

  return part.input ?? part.inputText;
}

/** 预览内容 */
const previewValue = computed(() => {
  const { part } = props;

  if (part.status === 'inputting') return getInputtingValue(part);

  if (part.status === 'executing') return part.input;

  return part.result;
});

/** 是否有可展示内容 */
const hasContent = computed(() => {
  if (props.part.status === 'done') return true;
  return hasStructuredValueContent(previewValue.value);
});
</script>

<style scoped lang="less">
.bubble-part-tool__icon {
  flex-shrink: 0;

  &--spin {
    animation: bubble-part-tool-spin 1.2s linear infinite;
  }
}

@keyframes bubble-part-tool-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.bubble-part-tool__name {
  flex: 1;
  width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bubble-part-tool__status--failure {
  margin-left: 8px;
  color: var(--color-error);
}
</style>

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
  /** 工具片段 */
  part: ChatMessageToolPart;
}

const props = withDefaults(defineProps<Props>(), {});

const [, bem] = createNamespace('', 'bubble-part-tool');

/** 图标 */
const icon = computed(() => {
  if (props.part.status === 'inputting') return 'lucide:loader-circle';
  if (props.part.status === 'done') {
    return props.part.result?.status === 'success' ? 'lucide:check-circle-2' : 'lucide:circle-alert';
  }
  return 'lucide:wrench';
});

/** 默认折叠：inputting 不折叠，其余折叠 */
const defaultCollapsed = computed(() => props.part.status !== 'inputting');

/** 标题文案 */
const title = computed(() => {
  const { alias } = getActionLabel(props.part.toolName);
  const statusPrefix = { inputting: '正在准备调用工具', executing: '调用工具', done: '工具结果' }[props.part.status];

  if (props.part.toolName === 'write_file' || props.part.toolName === 'edit_file') {
    const { input } = props.part;
    if (input && typeof input === 'object' && 'path' in input && typeof input.path === 'string') {
      return `${statusPrefix}：${input.path}`;
    }
  }

  return `${statusPrefix}：${alias}`;
});

/** 预览内容 */
const previewValue = computed(() => {
  if (props.part.status === 'inputting') {
    if (props.part.toolName === 'write_file' && typeof props.part.input === 'object' && props.part.input && 'content' in props.part.input) {
      return (props.part.input as Record<string, unknown>).content;
    }
    return props.part.input ?? props.part.inputText;
  }

  if (props.part.status === 'executing') {
    return props.part.input;
  }

  return props.part.result;
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
}

.bubble-part-tool__icon--spin {
  animation: bubble-part-tool-spin 1.2s linear infinite;
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

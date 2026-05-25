<template>
  <BubblePart type="tool-call" :has-content="hasContent">
    <template #title>
      <Icon icon="lucide:wrench" width="14" height="14" class="bubble-part-tool-call__icon" />
      <span>{{ title }}</span>
    </template>
    <BubblePartToolCode :value="part.input" />
  </BubblePart>
</template>

<script setup lang="ts">
/**
 * @file BubblePartToolCall.vue
 * @description 聊天工具调用片段组件，负责展示工具名称和输入参数，支持折叠功能。
 */
import type { ChatMessageToolCallPart } from 'types/chat';
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { hasStructuredValueContent } from '../../utils/messagePart';
import { getActionLabel } from '../../utils/toolLabels';
import BubblePart from './BubblePart.vue';
import BubblePartToolCode from './BubblePartToolCode.vue';

defineOptions({ name: 'BubblePartToolCall' });

interface Props {
  /** 工具调用片段 */
  part: ChatMessageToolCallPart;
}

const props = withDefaults(defineProps<Props>(), {});

const hasContent = computed(() => hasStructuredValueContent(props.part.input));

const title = computed(() => {
  const { alias } = getActionLabel(props.part.toolName);

  return `调用工具：${alias}`;
});
</script>

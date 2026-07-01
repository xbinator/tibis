<!--
  @file BubblePartWidget.vue
  @description 聊天消息中小组件快照片段的运行态展示组件。
-->
<template>
  <div :class="name">
    <BWidgetRuntime :render-context="part.renderContext" :value="part.value" @submit="handleSubmit" />
  </div>
</template>

<script setup lang="ts">
import type { ChatMessageWidgetPart, ChatMessageWidgetResultRuntimeInput, ChatMessageWidgetSubmitResult } from 'types/chat';
import { mapValues } from 'lodash-es';
import BWidgetRuntime from '@/components/BWidget/Runtime.vue';
import { isPlainRecord, stringifyRuntimeTextValue } from '@/utils/json';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'BubblePartWidget' });

interface Props {
  /** 小组件消息片段 */
  part: ChatMessageWidgetPart;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 小组件交互提交到聊天运行态 */
  'runtime-input': [input: ChatMessageWidgetResultRuntimeInput];
}>();

const [name] = createNamespace('', 'message-bubble-widget');

/**
 * 将小组件原始提交值转为成功结果。
 * @param output - 小组件原始提交值
 * @returns 小组件提交结果
 */
function createWidgetSubmitSuccessResult(output: unknown): ChatMessageWidgetSubmitResult {
  if (!isPlainRecord(output)) {
    return {
      status: 'success',
      data: { value: stringifyRuntimeTextValue(output) }
    };
  }

  const data = mapValues(output, stringifyRuntimeTextValue);

  return { status: 'success', data };
}

/**
 * 透传小组件提交结果并补充会话信息。
 * @param output - 小组件输出
 */
function handleSubmit(output: unknown): void {
  emit('runtime-input', {
    kind: 'widget_result',
    sessionId: props.part.sessionId,
    widgetId: props.part.widgetId,
    result: createWidgetSubmitSuccessResult(output)
  });
}
</script>

<style scoped lang="less">
.message-bubble-widget {
  min-width: 220px;
  overflow: hidden;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}
</style>

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
import type { ChatMessageWidgetPart, ChatMessageWidgetResultPart, ChatMessageWidgetSubmitResult } from 'types/chat';
import { onMounted } from 'vue';
import { mapValues } from 'lodash-es';
import BWidgetRuntime from '@/components/BWidget/Runtime.vue';
import { isPlainRecord, stringifyJsonValue, stringifyRuntimeTextValue } from '@/utils/json';
import { createNamespace } from '@/utils/namespace';
import { create } from '../../utils/messageHelper';
import { createRuntimeUserMessageSubmitAction, type BChatSubmitAction } from '../../utils/submitAction';
import { initWidgetMountState } from '../../utils/widgetRuntime';

defineOptions({ name: 'BubblePartWidget' });

interface Props {
  /** 小组件消息片段 */
  part: ChatMessageWidgetPart;
  /** 是否启用消息内独立运行态 */
  runtimeEnabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  runtimeEnabled: false
});

const emit = defineEmits<{
  /** 小组件交互提交到统一聊天提交器 */
  submit: [action: BChatSubmitAction];
  /** 小组件消息片段发生运行态变化 */
  change: [part: ChatMessageWidgetPart];
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
  const resultPart: ChatMessageWidgetResultPart = {
    type: 'widget_result',
    sessionId: props.part.sessionId,
    widgetId: props.part.widgetId,
    result: createWidgetSubmitSuccessResult(output),
    submittedAt: new Date().toISOString()
  };
  const userMessage = create.userMessage(stringifyJsonValue(resultPart, { space: 2 }));
  userMessage.parts = [resultPart];

  emit(
    'submit',
    createRuntimeUserMessageSubmitAction({
      userMessage,
      parts: [resultPart],
      errorMessage: '提交小组件结果失败'
    })
  );
}

/**
 * 初始化小组件消息运行态，并把状态变化交给消息宿主写回。
 */
async function initWidgetRuntime(): Promise<void> {
  if (!props.runtimeEnabled) return;

  const nextPart = await initWidgetMountState(props.part);
  if (nextPart !== props.part) {
    emit('change', nextPart);
  }
}

onMounted((): void => {
  initWidgetRuntime().catch((): undefined => undefined);
});
</script>

<style scoped lang="less">
.message-bubble-widget {
  min-width: 220px;
  overflow: hidden;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}
</style>

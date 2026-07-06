<!--
  @file BubblePartWidget.vue
  @description 聊天消息中小组件快照片段的运行态展示组件。
-->
<template>
  <div :class="name">
    <BWidgetRuntime :render-context="runtimeRenderContext" runtime-enabled :value="widgetDisplay.value" @change="handleRuntimeChange" />
  </div>
</template>

<script setup lang="ts">
import type { ChatMessageTextPart } from 'types/chat';
import type { WidgetRenderContext, WidgetRuntimeSendMessage } from 'types/widget';
import { computed, shallowRef } from 'vue';
import { isString } from 'lodash-es';
import { nanoid } from 'nanoid';
import BWidgetRuntime from '@/components/BWidget/Runtime.vue';
import type { WidgetRuntimeChange } from '@/components/BWidget/utils/widgetRuntime';
import { createNamespace } from '@/utils/namespace';
import { create, type WidgetToolPart } from '../../../utils/messageHelper';
import { createToolPartStateUpdate, type SubmitAction } from '../../../utils/submitAction';

defineOptions({ name: 'BubblePartWidget' });

interface Props {
  /** 所属聊天消息 ID，消息内运行态需要用它写回状态。 */
  messageId: string;
  /** 已通过父组件判定的 open_widget 工具片段，小组件运行数据通过 part.state 持久化。 */
  part: WidgetToolPart;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 小组件交互提交到统一聊天提交器 */
  submit: [action: SubmitAction];
}>();

const [name] = createNamespace('', 'message-bubble-widget');

/** renderer 本地刚运行出的渲染数据，用于抵御流式旧快照回退。 */
const localRenderData = shallowRef<WidgetRenderContext['data'] | null>(null);

/** 当前 open_widget 展示载荷。 */
const widgetDisplay = computed(() => props.part.result.data);

/** 当前可渲染上下文，优先使用宿主已确认状态，其次使用本地刚执行出的状态。 */
const runtimeRenderContext = computed<WidgetRenderContext>(() => {
  return {
    ...widgetDisplay.value.renderContext,
    data: props.part.state?.renderData ?? localRenderData.value ?? widgetDisplay.value.renderContext.data
  };
});

/**
 * 将小组件上行消息内容归一化为聊天文本 part。
 * @param content - 小组件上行消息内容
 * @returns 带稳定 ID 的文本消息片段
 */
function normalizeWidgetSendMessageTextParts(content: WidgetRuntimeSendMessage['content']): ChatMessageTextPart[] {
  if (isString(content)) {
    return [{ id: nanoid(), type: 'text', text: content }];
  }

  return content.map((part) => ({ id: nanoid(), type: 'text', text: part.text }));
}

/**
 * 创建运行态变化提交动作。
 * @param messageId - 所属聊天消息 ID
 * @param partId - 小组件运行态所在的消息片段 ID
 * @param change - BWidget 运行态变化
 * @returns 统一提交动作
 */
function createWidgetRuntimeChangeSubmitAction(messageId: string, partId: string, change: WidgetRuntimeChange): SubmitAction {
  const updateStateAction = createToolPartStateUpdate(messageId, partId, (state) => ({
    ...state,
    renderData: change.renderContext.data
  }));

  return {
    async run(context): Promise<void> {
      await updateStateAction.run(context);

      if (!change.sendMessage) return;

      // 将小组件脚本上行消息归一化为聊天提交输入，避免额外抽象层
      const { sendMessage } = change;
      const rawParts = normalizeWidgetSendMessageTextParts(sendMessage.content);
      const rawContent = rawParts.map((part): string => part.text).join('\n');
      const content = sendMessage.isError ? `小组件错误：${rawContent}` : rawContent;
      const parts: ChatMessageTextPart[] = sendMessage.isError ? [{ id: nanoid(), type: 'text', text: content }] : rawParts;
      const userMessage = create.userMessage(content);
      userMessage.parts = parts;

      await context.sendAdaptedUserMessage({ userMessage, parts });
    }
  };
}

/**
 * 处理 BWidget 内部脚本执行完成后的运行态变化。
 * @param change - BWidget 运行态变化
 */
function handleRuntimeChange(change: WidgetRuntimeChange): void {
  localRenderData.value = change.renderContext.data;

  emit('submit', createWidgetRuntimeChangeSubmitAction(props.messageId, props.part.id, change));
}
</script>

<style scoped lang="less">
.message-bubble-widget {
  overflow: hidden;
}
</style>

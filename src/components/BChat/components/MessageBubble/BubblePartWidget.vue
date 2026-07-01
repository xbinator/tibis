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
import type { Message } from '../../utils/types';
import type { ChatMessageTextPart, ChatMessageWidgetPart, ChatMessageWidgetResultPart } from 'types/chat';
import type { WidgetRuntimeSendMessage } from 'types/widget';
import { onMounted } from 'vue';
import { isString } from 'lodash-es';
import { nanoid } from 'nanoid';
import BWidgetRuntime from '@/components/BWidget/Runtime.vue';
import { createWidgetSubmitSuccessResult } from '@/shared/widget/protocol';
import { stringifyJsonValue } from '@/utils/json';
import { createNamespace } from '@/utils/namespace';
import { create } from '../../utils/messageHelper';
import { createRuntimeUserMessageSubmitAction, type BChatAdaptedUserMessageSubmitInput, type BChatSubmitAction } from '../../utils/submitAction';
import { finishWidgetRuntime, initWidgetMountState } from '../../utils/widgetRuntime';

defineOptions({ name: 'BubblePartWidget' });

interface Props {
  /** 所属聊天消息 ID，消息内运行态需要用它写回状态。 */
  messageId?: string;
  /** 小组件消息片段 */
  part: ChatMessageWidgetPart;
  /** 是否启用消息内独立运行态 */
  runtimeEnabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  messageId: undefined,
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
 * 小组件片段收尾后的消息更新结果。
 */
interface WidgetPartFinishMessageResult {
  /** 更新后的消息。 */
  message: Message;
  /** 脚本声明的上行消息。 */
  sendMessage?: WidgetRuntimeSendMessage;
}

/**
 * 创建替换指定小组件片段后的消息，片段未变化时返回原消息。
 * @param currentMessage - 当前消息
 * @param partId - 小组件片段 ID
 * @param currentPart - 当前小组件片段
 * @param nextPart - 下一版小组件片段
 * @returns 替换指定片段后的消息，片段未变化时返回原消息
 */
function createWidgetPartUpdatedMessage(currentMessage: Message, partId: string, currentPart: ChatMessageWidgetPart, nextPart: ChatMessageWidgetPart): Message {
  if (nextPart === currentPart) return currentMessage;

  return {
    ...currentMessage,
    parts: currentMessage.parts.map((sourcePart) => (sourcePart.id === partId ? nextPart : sourcePart))
  };
}

/**
 * 创建完成指定小组件片段后的消息。
 * @param currentMessage - 当前消息
 * @param partId - 小组件片段 ID
 * @returns 执行收尾后的消息；无法收尾时返回原消息
 */
function createWidgetPartFinishedMessage(currentMessage: Message, partId: string): WidgetPartFinishMessageResult {
  const currentPart = currentMessage.parts.find((part): part is ChatMessageWidgetPart => part.type === 'widget' && part.id === partId);
  if (currentPart?.type !== 'widget') return { message: currentMessage };

  const finishResult = finishWidgetRuntime(currentPart);
  const message = createWidgetPartUpdatedMessage(currentMessage, partId, currentPart, finishResult.part);

  return {
    message,
    ...(finishResult.sendMessage ? { sendMessage: finishResult.sendMessage } : {})
  };
}

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
 * 将小组件脚本上行消息转成 BChat 统一用户消息提交输入。
 * @param sendMessage - 小组件脚本上行消息
 * @returns 统一用户消息提交输入
 */
function createWidgetSendMessageSubmitInput(sendMessage: WidgetRuntimeSendMessage): BChatAdaptedUserMessageSubmitInput {
  const rawParts = normalizeWidgetSendMessageTextParts(sendMessage.content);
  const rawContent = rawParts.map((part): string => part.text).join('\n');
  const content = sendMessage.isError ? `小组件错误：${rawContent}` : rawContent;
  const parts: ChatMessageTextPart[] = sendMessage.isError ? [{ id: nanoid(), type: 'text', text: content }] : rawParts;
  const userMessage = create.userMessage(content);
  userMessage.parts = parts;

  return {
    userMessage,
    parts,
    errorMessage: '发送小组件消息失败'
  };
}

/**
 * 创建小组件默认提交结果动作。
 * @param output - 小组件输出
 * @returns 统一提交动作
 */
function createWidgetResultSubmitAction(output: unknown): BChatSubmitAction {
  const resultPart: ChatMessageWidgetResultPart = {
    id: nanoid(),
    type: 'widget_result',
    sessionId: props.part.sessionId,
    widgetId: props.part.widgetId,
    result: createWidgetSubmitSuccessResult(output),
    submittedAt: new Date().toISOString()
  };
  const userMessage = create.userMessage(stringifyJsonValue(resultPart, { space: 2 }));
  userMessage.parts = [resultPart];

  return createRuntimeUserMessageSubmitAction({
    userMessage,
    parts: [resultPart],
    errorMessage: '提交小组件结果失败'
  });
}

/**
 * 创建带运行态收尾的小组件提交动作。
 * @param action - 小组件默认提交动作
 * @returns 统一提交动作
 */
function createWidgetRuntimeFinishSubmitAction(action: BChatSubmitAction): BChatSubmitAction {
  const { messageId } = props;
  const partId = props.part.id;
  if (!messageId) return action;

  return {
    async run(context): Promise<void> {
      const currentMessage = context.getMessage(messageId);
      if (!currentMessage) {
        await action.run(context);
        return;
      }

      const finishResult = createWidgetPartFinishedMessage(currentMessage, partId);
      await context.updateMessage(messageId, (): Message => finishResult.message);

      if (finishResult.sendMessage) {
        await context.sendAdaptedUserMessage(createWidgetSendMessageSubmitInput(finishResult.sendMessage));
        return;
      }

      await action.run(context);
    }
  };
}

/**
 * 透传小组件提交结果并补充会话信息。
 * @param output - 小组件输出
 */
function handleSubmit(output: unknown): void {
  emit('submit', createWidgetRuntimeFinishSubmitAction(createWidgetResultSubmitAction(output)));
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

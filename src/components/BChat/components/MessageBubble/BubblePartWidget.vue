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
import type { ChatMessageTextPart, ChatMessageWidgetPart, ChatMessageWidgetResultPart, ChatMessageWidgetSubmitResult } from 'types/chat';
import { onMounted } from 'vue';
import { mapValues } from 'lodash-es';
import BWidgetRuntime from '@/components/BWidget/Runtime.vue';
import { isPlainRecord, stringifyJsonValue, stringifyRuntimeTextValue } from '@/utils/json';
import { createNamespace } from '@/utils/namespace';
import { create } from '../../utils/messageHelper';
import { createRuntimeUserMessageSubmitAction, type BChatAdaptedUserMessageSubmitInput, type BChatSubmitAction } from '../../utils/submitAction';
import { finishWidgetRuntime, initWidgetMountState, type WidgetRuntimeSendMessage } from '../../utils/widgetRuntime';

defineOptions({ name: 'BubblePartWidget' });

interface Props {
  /** 所属聊天消息 ID，消息内运行态需要用它写回状态。 */
  messageId?: string;
  /** 小组件消息片段 */
  part: ChatMessageWidgetPart;
  /** 小组件片段在消息 parts 中的位置；由工具结果派生展示时为 null。 */
  partIndex?: number | null;
  /** 是否启用消息内独立运行态 */
  runtimeEnabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  messageId: undefined,
  partIndex: null,
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
 * 创建替换指定小组件片段后的消息。
 * @param currentMessage - 当前消息
 * @param partIndex - 小组件片段在消息 parts 中的位置
 * @param part - 下一版小组件片段
 * @returns 替换指定片段后的消息
 */
function createWidgetPartUpdatedMessage(currentMessage: Message, partIndex: number, part: ChatMessageWidgetPart): Message {
  return {
    ...currentMessage,
    parts: currentMessage.parts.map((sourcePart, index) => (index === partIndex ? part : sourcePart))
  };
}

/**
 * 创建完成指定小组件片段后的消息。
 * @param currentMessage - 当前消息
 * @param partIndex - 小组件片段在消息 parts 中的位置
 * @returns 执行收尾后的消息；无法收尾时返回原消息
 */
function createWidgetPartFinishedMessage(currentMessage: Message, partIndex: number): WidgetPartFinishMessageResult {
  const currentPart = currentMessage.parts[partIndex];
  if (currentPart?.type !== 'widget') return { message: currentMessage };

  const finishResult = finishWidgetRuntime(currentPart);
  const message = finishResult.part === currentPart ? currentMessage : createWidgetPartUpdatedMessage(currentMessage, partIndex, finishResult.part);

  return {
    message,
    ...(finishResult.sendMessage ? { sendMessage: finishResult.sendMessage } : {})
  };
}

/**
 * 将小组件脚本上行消息转成 BChat 统一用户消息提交输入。
 * @param sendMessage - 小组件脚本上行消息
 * @returns 统一用户消息提交输入
 */
function createWidgetSendMessageSubmitInput(sendMessage: WidgetRuntimeSendMessage): BChatAdaptedUserMessageSubmitInput {
  const rawParts: ChatMessageTextPart[] = typeof sendMessage.content === 'string' ? [{ type: 'text', text: sendMessage.content }] : sendMessage.content;
  const rawContent = rawParts.map((part): string => part.text).join('\n');
  const content = sendMessage.isError ? `小组件错误：${rawContent}` : rawContent;
  const parts: ChatMessageTextPart[] = sendMessage.isError ? [{ type: 'text', text: content }] : rawParts;
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
  const { messageId, partIndex } = props;
  if (!messageId || partIndex === null) return action;

  return {
    async run(context): Promise<void> {
      const currentMessage = context.getMessage(messageId);
      if (!currentMessage) {
        await action.run(context);
        return;
      }

      const finishResult = createWidgetPartFinishedMessage(currentMessage, partIndex);
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

<!--
  @file BubblePartWidget.vue
  @description 聊天消息中小组件快照片段的运行态展示组件。
-->
<template>
  <div v-if="widgetPart" :class="name">
    <BWidgetRuntime
      :lifecycle="widgetPart.lifecycle"
      :render-context="widgetPart.renderContext"
      :runtime-enabled="runtimeEnabled"
      :status="widgetPart.status"
      :value="widgetPart.value"
      @change="handleRuntimeChange"
    />
  </div>
</template>

<script setup lang="ts">
import type { Message } from '../../../utils/types';
import type { ChatMessagePart, ChatMessageTextPart, ChatMessageToolPart, ChatMessageWidgetPart, ChatMessageWidgetRuntime } from 'types/chat';
import type { WidgetRuntimeChange, WidgetRuntimeSendMessage } from 'types/widget';
import { computed } from 'vue';
import { isString } from 'lodash-es';
import { nanoid } from 'nanoid';
import BWidgetRuntime from '@/components/BWidget/Runtime.vue';
import { createNamespace } from '@/utils/namespace';
import { create } from '../../../utils/messageHelper';
import { createRuntimeUserMessageSubmitAction, type BChatAdaptedUserMessageSubmitInput, type BChatSubmitAction } from '../../../utils/submitAction';

defineOptions({ name: 'BubblePartWidget' });

interface Props {
  /** 所属聊天消息，消息内运行态需要用它写回状态。 */
  message?: Message;
  /** open_widget 工具片段，小组件运行态通过 part.widget 持久化。 */
  part: ChatMessageToolPart;
}

const props = withDefaults(defineProps<Props>(), {
  message: undefined
});

const emit = defineEmits<{
  /** 小组件交互提交到统一聊天提交器 */
  submit: [action: BChatSubmitAction];
  /** 小组件消息片段发生运行态变化 */
  change: [part: ChatMessageWidgetPart];
}>();

const [name] = createNamespace('', 'message-bubble-widget');
/** 从 open_widget 工具片段读取当前可渲染的小组件运行态。 */
const widgetPart = computed<ChatMessageWidgetPart | null>(() => (props.part.widget ? { id: props.part.id, type: 'widget', ...props.part.widget } : null));
/** 是否启用 BWidget 独立运行态；消息内运行态以 tool.widget 是否已写回为准。 */
const runtimeEnabled = computed<boolean>(() => Boolean(props.part.widget));

/**
 * 将可渲染的小组件片段转换成工具片段内的运行态。
 * @param part - 小组件片段
 * @returns 工具片段内的小组件运行态
 */
function toWidgetRuntime(part: ChatMessageWidgetPart): ChatMessageWidgetRuntime {
  return {
    sessionId: part.sessionId,
    widgetId: part.widgetId,
    status: part.status,
    lifecycle: part.lifecycle,
    value: part.value,
    renderContext: part.renderContext
  };
}

/**
 * 从消息片段中读取小组件运行态。
 * @param part - 消息片段
 * @returns 可执行的小组件片段；不存在时返回 null
 */
function resolveWidgetPartFromMessagePart(part: ChatMessagePart): ChatMessageWidgetPart | null {
  if (part.type !== 'tool') return null;

  if (part.widget) {
    return { id: part.id, type: 'widget', ...part.widget };
  }

  return null;
}

/**
 * 使用下一版小组件运行态更新宿主消息片段。
 * @param sourcePart - 当前宿主消息片段
 * @param nextPart - 下一版小组件运行态片段
 * @returns 更新后的宿主消息片段
 */
function updateHostMessagePart(sourcePart: ChatMessagePart, nextPart: ChatMessageWidgetPart): ChatMessagePart {
  if (sourcePart.type !== 'tool') return sourcePart;

  return {
    ...sourcePart,
    widget: toWidgetRuntime(nextPart)
  } satisfies ChatMessageToolPart;
}

/**
 * 创建替换指定小组件片段后的消息，片段未变化时返回原消息。
 * @param currentMessage - 当前消息
 * @param partId - 小组件运行态所在的消息片段 ID
 * @param currentPart - 当前小组件片段
 * @param nextPart - 下一版小组件片段
 * @returns 替换指定片段后的消息，片段未变化时返回原消息
 */
function createWidgetPartUpdatedMessage(currentMessage: Message, partId: string, currentPart: ChatMessageWidgetPart, nextPart: ChatMessageWidgetPart): Message {
  if (nextPart === currentPart) return currentMessage;

  return {
    ...currentMessage,
    parts: currentMessage.parts.map((sourcePart) => (sourcePart.id === partId ? updateHostMessagePart(sourcePart, nextPart) : sourcePart))
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
 * 使用运行态变化结果创建下一版小组件片段。
 * @param currentPart - 当前小组件片段
 * @param change - BWidget 运行态变化
 * @returns 合并运行态变化后的小组件片段
 */
function createWidgetPartFromRuntimeChange(currentPart: ChatMessageWidgetPart, change: WidgetRuntimeChange): ChatMessageWidgetPart {
  return {
    ...currentPart,
    value: change.value,
    status: change.status,
    lifecycle: change.lifecycle,
    renderContext: change.renderContext
  };
}

/**
 * 使用运行态变化结果更新宿主消息。
 * @param currentMessage - 当前消息
 * @param partId - 小组件运行态所在的消息片段 ID
 * @param change - BWidget 运行态变化
 * @returns 更新后的消息；找不到小组件片段时返回原消息
 */
function createWidgetRuntimeChangedMessage(currentMessage: Message, partId: string, change: WidgetRuntimeChange): Message {
  const hostPart = currentMessage.parts.find((part): boolean => part.id === partId);
  const currentPart = hostPart ? resolveWidgetPartFromMessagePart(hostPart) : null;
  if (!currentPart) return currentMessage;

  const nextPart = createWidgetPartFromRuntimeChange(currentPart, change);

  return createWidgetPartUpdatedMessage(currentMessage, partId, currentPart, nextPart);
}

/**
 * 创建运行态变化提交动作。
 * @param change - BWidget 运行态变化
 * @returns 统一提交动作
 */
function createWidgetRuntimeChangeSubmitAction(change: WidgetRuntimeChange): BChatSubmitAction {
  const hostMessage = props.message;

  return {
    async run(context): Promise<void> {
      if (hostMessage) {
        const currentMessage = context.getMessage(hostMessage.id);
        if (currentMessage) {
          const nextMessage = createWidgetRuntimeChangedMessage(currentMessage, props.part.id, change);
          await context.updateMessage(hostMessage.id, (): Message => nextMessage);
        }
      }

      if (change.sendMessage) {
        await context.sendAdaptedUserMessage(createWidgetSendMessageSubmitInput(change.sendMessage));
      }
    }
  };
}

/**
 * 处理 BWidget 内部脚本执行完成后的运行态变化。
 * @param change - BWidget 运行态变化
 */
function handleRuntimeChange(change: WidgetRuntimeChange): void {
  const currentPart = widgetPart.value;
  if (!currentPart) return;

  if (!props.message) {
    emit('change', createWidgetPartFromRuntimeChange(currentPart, change));

    if (change.sendMessage) {
      emit('submit', createRuntimeUserMessageSubmitAction(createWidgetSendMessageSubmitInput(change.sendMessage)));
    }

    return;
  }

  emit('submit', createWidgetRuntimeChangeSubmitAction(change));
}
</script>

<style scoped lang="less">
.message-bubble-widget {
  overflow: hidden;
}
</style>

<!--
  @file BubblePartWidget.vue
  @description 聊天消息中小组件快照片段的运行态展示组件。
-->
<template>
  <div :class="name">
    <BWidgetRuntime :commit-runtime-change="handleRuntimeChange" :render-context="runtimeRenderContext" :value="widgetDisplay.value" />
  </div>
</template>

<script setup lang="ts">
import type { SubmitAction } from '../../../utils/submitAction';
import type { ChatMessageTextPart } from 'types/chat';
import type { WidgetDisplayPayload, WidgetRenderContext, WidgetRuntimeSendMessage } from 'types/widget';
import { computed, shallowRef } from 'vue';
import { cloneDeep, isEqual, isString } from 'lodash-es';
import { nanoid } from 'nanoid';
import BWidgetRuntime from '@/components/BWidget/Runtime.vue';
import type { WidgetRuntimeChange } from '@/components/BWidget/utils/widgetRuntime';
import { createNamespace } from '@/utils/namespace';
import { create, type WidgetToolPart } from '../../../utils/messageHelper';

defineOptions({ name: 'BubblePartWidget' });

interface Props {
  /** 持有当前工具片段的消息 ID。 */
  messageId: string;
  /** 已通过父组件判定的 open_widget 工具片段。 */
  part: WidgetToolPart;
  /** 可 await 的统一提交函数，用于让 Widget runtime 等待宿主提交完成。 */
  submitAction?: (action: SubmitAction) => Promise<void> | void;
}

const props = defineProps<Props>();

const [name] = createNamespace('', 'message-bubble-widget');

/** renderer 本地刚运行出的渲染上下文，用于抵御流式旧快照回退。 */
const localRenderContext = shallowRef<WidgetRenderContext | null>(null);
/** 产生本地渲染上下文时对应的 open_widget 展示源。 */
const localRenderSource = shallowRef<WidgetDisplayPayload | null>(null);

/** 当前 open_widget 展示载荷。 */
const widgetDisplay = computed(() => props.part.result.data);

/** 当前展示源仍匹配时可继续使用的本地渲染上下文。 */
const currentLocalRenderContext = computed<WidgetRenderContext | null>(() => {
  if (!localRenderContext.value || !localRenderSource.value) return null;

  return isEqual(localRenderSource.value, widgetDisplay.value) ? localRenderContext.value : null;
});

/** 当前可渲染上下文，优先使用本地刚执行出的运行态数据。 */
const runtimeRenderContext = computed<WidgetRenderContext>(() => {
  return currentLocalRenderContext.value ?? widgetDisplay.value.renderContext;
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
 * 创建小组件上行消息提交动作。
 * @param sendMessage - 小组件脚本上行消息
 * @returns 统一提交动作
 */
function createSendMessageAction(sendMessage: WidgetRuntimeSendMessage): SubmitAction {
  return {
    async run(context): Promise<void> {
      // 将小组件脚本上行消息归一化为聊天提交输入，避免额外抽象层
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
 * 创建小组件运行态变化提交动作。
 * @param messageId - 持有当前工具片段的消息 ID
 * @param part - 当前 open_widget 工具片段
 * @param change - 运行态变化
 * @returns 统一提交动作
 */
function createRuntimeChangeAction(messageId: string, part: WidgetToolPart, change: WidgetRuntimeChange): SubmitAction {
  return {
    async run(context): Promise<void> {
      const nextPart = cloneDeep(part);
      nextPart.result.data.renderContext = cloneDeep(change.renderContext);
      await context.updateMessagePart({ messageId, part: nextPart });

      if (!change.sendMessage) return;

      await createSendMessageAction(change.sendMessage).run(context);
    }
  };
}

/**
 * 提交运行态变化动作；有可 await 宿主提交函数时优先等待它完成。
 * @param action - 统一提交动作
 */
async function submitRuntimeAction(action: SubmitAction): Promise<void> {
  await props.submitAction?.(action);
}

/**
 * 处理 BWidget 内部脚本执行完成后的运行态变化。
 * @param change - BWidget 运行态变化
 */
async function handleRuntimeChange(change: WidgetRuntimeChange): Promise<void> {
  localRenderContext.value = change.renderContext;
  localRenderSource.value = cloneDeep(widgetDisplay.value);
  await submitRuntimeAction(createRuntimeChangeAction(props.messageId, props.part, change));
}
</script>

<style scoped lang="less">
.message-bubble-widget {
  overflow: hidden;
}
</style>

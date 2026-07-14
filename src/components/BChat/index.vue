<!--
  @file index.vue
  @description 聊天侧边栏组件，包含会话管理、消息列表、输入框和模型选择功能。
-->
<template>
  <div ref="containerRef" :class="bem('container')">
    <div :class="bem('conversation-container')">
      <ConversationView
        ref="conversationRef"
        v-model:messages="messages"
        :loading="loading"
        :disabled="messageInteractionDisabled"
        :on-load-history="handleLoadHistory"
        :can-rollback="rollbackController.canRollback"
        :submit-action="chatSubmitter.submit"
        @edit="handleChatEdit"
        @branch="handleBranch"
        @regenerate="handleChatRegenerate"
        @rollback="handleRollback"
      >
        <template #footer>
          <ConfirmationSheet :request="confirmationController.currentConfirmationRequest.value" @action="handleConfirmationSheetAction" />
        </template>
      </ConversationView>

      <div :class="bem('floating-container')">
        <UsagePanel
          v-if="usagePanel.open.value"
          :loading="usagePanel.loading.value"
          :usage="usagePanel.usage.value"
          :error="usagePanel.error.value"
          :on-close="usagePanel.close"
        />

        <InteractionContainer :toast-queue="toastQueue" @remove-toast="removeToast" />
      </div>
    </div>

    <div :class="bem('toolbar')">
      <TodoPanel v-if="currentSessionTodos.length > 0 && !todoPanelDismissed" v-model:visible="todoPanelVisible" :todos="currentSessionTodos" />
    </div>

    <div :class="bem('input')">
      <div :class="bem('input-container', { dragover: isContainerDragActive })">
        <ImagePreview :images="inputImages" :supports-vision="supportsVision" :on-remove-image="inputEvents.removeImage" />

        <BTextEditor
          ref="promptEditorRef"
          v-model:value="inputContent"
          placeholder="输入消息..."
          :max-height="200"
          :chip-resolver="promptChipResolver"
          :on-paste-files="fileReference.onPasteFiles"
          :on-paste-images="imageUpload.onPasteImages"
          :can-accept-images="imageUpload.canAcceptImages"
          :slash-commands="chatSlashCommands"
          :file-mentions="fileMentionOptions"
          :on-cancel="handleCancel"
          submit-on-enter
          @slash-command="handleSlashCommand"
          @file-mention-select="handleFileMentionSelect"
          @submit="handleChatSubmit"
        />

        <InputToolbar
          :loading="loading"
          :input-value="inputContent"
          :selected-model="selectedModel"
          :supports-vision="supportsVision"
          :can-submit="canSubmit"
          :used-tokens="usedTokens"
          :context-window="contextWindow"
          :context-usage="displayedContextUsageSnapshot"
          @submit="handleChatSubmit"
          @abort="handleAbort"
          @image-select="imageUpload.appendImages"
          @model-change="handleModelChange"
          @voice-start="handleVoiceStart"
          @voice-partial="handleVoicePartial"
          @voice-complete="handleVoiceComplete"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BChatProps, Message } from './utils/types';
import type { ChatMessageConfirmationAction, ChatSession } from 'types/chat';
import type { ChatRuntimeContextUsageSnapshot } from 'types/chat-runtime';
import { computed, h, onUnmounted, provide, ref, toRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { ContextUsageBudgetSnapshot } from '@@/shared/ai/context/usageBudget.ts';
import { findPendingInteraction } from '@/ai/chat/policies/pendingInteraction';
import type { ChatSessionUIEvent } from '@/ai/chat/sessionEvents';
import BTextEditor from '@/components/BText/Editor.vue';
import { useChatActorSystem } from '@/hooks/useChatActorSystem';
import { useNavigate } from '@/hooks/useNavigate';
import { useProviderStore } from '@/stores/ai/provider';
import { useChatSessionStore } from '@/stores/chat/session';
import { useCommandPanelStore } from '@/stores/ui/commandPanel';
import { asyncTo } from '@/utils/asyncTo';
import { createNamespace } from '@/utils/namespace';
import ConfirmationSheet from './components/ConfirmationSheet.vue';
import ConversationView from './components/ConversationView.vue';
import ImagePreview from './components/ImagePreview.vue';
import InputToolbar from './components/InputToolbar.vue';
import InteractionContainer from './components/InteractionContainer/index.vue';
import TodoPanel from './components/TodoPanel.vue';
import UsagePanel from './components/UsagePanel.vue';
import { useChatComposer } from './hooks/useChatComposer';
import { useChatServiceConfig } from './hooks/useChatServiceConfig';
import { useChatSessionActor } from './hooks/useChatSessionActor';
import { useChatSessionLifecycle } from './hooks/useChatSessionLifecycle';
import { useChatWorkflow } from './hooks/useChatWorkflow';
import { useContextUsage } from './hooks/useContextUsage';
import { useInteractionState } from './hooks/useInteractionState';
import { useRuntimeBridgeHandler } from './hooks/useRuntimeBridgeHandler';
import { useRuntimeConfig } from './hooks/useRuntimeConfig';
import { useRuntimeRequestConfig } from './hooks/useRuntimeRequestConfig';
import { useRuntimeTools } from './hooks/useRuntimeTools';
import { useSlashCommands, chatSlashCommands } from './hooks/useSlashCommands';
import { useTodoPanel } from './hooks/useTodoPanel';
import { useUsagePanel } from './hooks/useUsagePanel';
import { createChatConfirmationController } from './utils/confirmationController';
import { userChoice } from './utils/messageHelper';

const [, bem] = createNamespace('chat');

const props = withDefaults(defineProps<BChatProps>(), {
  sessionId: null
});

const emit = defineEmits<{
  (e: 'session-created', session: ChatSession): void;
  (e: 'session-title-persisted', sessionId: string, title: string): void;
  (e: 'draft-session-created'): void;
  (e: 'loading-change', loading: boolean): void;
  (e: 'navigate-to-provider'): void;
}>();

/** 聊天数据存储 */
const chatStore = useChatSessionStore();

const router = useRouter();

/** 交互容器状态 */
const { api: interactionAPI, toastQueue, removeToast } = useInteractionState();

/** 提供交互 API */
provide('interaction', interactionAPI);

/** 通用文件打开导航能力 */
const { openFile, openWebview } = useNavigate();
/** 输入编辑器实例。 */
const promptEditorRef = ref<InstanceType<typeof BTextEditor>>();
/** 聚焦输入编辑器。 */
function focusInput(options?: { moveToEnd?: boolean }): void {
  promptEditorRef.value?.focus?.(options);
}
/** 输入区域状态与交互能力。 */
const composer = useChatComposer({
  showToast: interactionAPI.showToast,
  openFile,
  editor: {
    focus: focusInput,
    saveCursorPosition: (): void => promptEditorRef.value?.saveCursorPosition(),
    getCursorPosition: (): number => promptEditorRef.value?.getCursorPosition() ?? 0,
    replaceTextRange: (from: number, to: number, text: string): void => promptEditorRef.value?.replaceTextRange(from, to, text),
    insertTextAtCursor: (text: string): void => promptEditorRef.value?.insertTextAtCursor(text)
  }
});
const {
  // @ts-ignore
  containerRef,
  imageUpload,
  fileReference,
  canSubmit,
  isContainerDragActive,
  fileMentionOptions,
  promptChipResolver,
  handleFileMentionSelect,
  handleVoiceStart,
  handleVoicePartial,
  handleVoiceComplete
} = composer;
/** 草稿输入状态与操作。 */
const { inputContent, inputImages, ...inputEvents } = composer.input;
/** 模型选择状态与操作。 */
const { selectedModel, supportsVision, contextWindow, ...modelSelectionEvents } = composer.model;
/** 全局命令面板 Store。 */
const commandPanelStore = useCommandPanelStore();
/** Provider 数据源。 */
const providerStore = useProviderStore();
/** 是否存在至少一个已启用的模型，用于「去配置」点击分支。 */
const hasAvailableModels = computed<boolean>(() => providerStore.availableModels.length > 0);
/** 对话视图引用 */
const conversationRef = ref<InstanceType<typeof ConversationView>>();
/** 当前正在创建会话分支的助手消息 ID，用于底层拦截重复请求。 */
const branchingMessageId = ref<string>();
/** 确认控制器，管理工具调用的用户确认流程 */
const confirmationController = createChatConfirmationController();
/** 用量面板 hook */
const usagePanel = useUsagePanel();
/** 主进程 runtime 上报的上下文窗口用量快照。 */
const runtimeContextUsageSnapshot = ref<ContextUsageBudgetSnapshot | undefined>(undefined);
/** 提供给早期初始化回调的工作流忙碌镜像。 */
const workflowLoading = ref<boolean>(false);
/** 会话 ID、历史消息与自动命名生命周期。 */
const sessionLifecycle = useChatSessionLifecycle({
  sessionId: toRef(props, 'sessionId'),
  isLoading: (): boolean => workflowLoading.value,
  disposeConfirmation: confirmationController.dispose,
  resetUsagePanel: usagePanel.reset,
  resetRuntimeContextUsage: (): void => {
    runtimeContextUsageSnapshot.value = undefined;
  },
  focusInput,
  hasPendingUserChoice: (sourceMessages: Message[]): boolean => Boolean(userChoice.findPending(sourceMessages)),
  onSessionCreated: (session: ChatSession): void => emit('session-created', session),
  onSessionTitlePersisted: (sessionId: string, title: string): void => emit('session-title-persisted', sessionId, title),
  onDraftSessionCreated: (): void => emit('draft-session-created')
});
const {
  activeSessionId,
  currentSessionForAutoName,
  setLoadedMessages,
  fetchAllPriorHistory,
  messages,
  ensureActiveSession,
  createDraftSession,
  handleLoadHistory,
  captureAutoNameSnapshot,
  scheduleAutoName
} = sessionLifecycle;
/** 应用级 Chat Actor system。 */
const chatActorSystem = useChatActorSystem();
/** Workflow 创建前收到的待重放 Session UI 事件。 */
const pendingSessionUIEvents: ChatSessionUIEvent[] = [];
/** 当前 Session UI 事件处理器，Workflow 创建前先暂存事件。 */
let handleSessionUIEvent = (event: ChatSessionUIEvent): void => {
  pendingSessionUIEvents.push(event);
};
/** 当前会话 Actor 状态与领域事件 API。 */
const chatSessionActor = useChatSessionActor({
  activeSessionId,
  actorSystem: chatActorSystem,
  onUIEvent: (event: ChatSessionUIEvent): void => handleSessionUIEvent(event)
});
watch(messages, (loadedMessages: Message[]): void => {
  const sessionId = activeSessionId.value;
  if (!sessionId) return;
  const interaction = findPendingInteraction(loadedMessages, sessionId);
  if (interaction) chatSessionActor.recoverInteraction(interaction);
});
/** Todo 面板状态和回退恢复能力。 */
const { currentSessionTodos, todoPanelVisible, todoPanelDismissed, restoreTodoSnapshotsForMessages } = useTodoPanel({ activeSessionId });
/** Runtime 内置工具能力。 */
const { workspaceRoot, getActiveTools, syncAIResources, getSkillContentHashes, openDraft, openFileByPath } = useRuntimeTools({
  messages,
  confirm: confirmationController.createAdapter(),
  getSessionId: () => activeSessionId.value ?? undefined,
  openWebview
});

/**
 * 处理底部确认弹窗操作。
 * @param action - 用户操作（approve/approve-session/approve-always/cancel）
 */
function handleConfirmationSheetAction(action: ChatMessageConfirmationAction): void {
  const confirmationId = confirmationController.currentConfirmationId.value;
  if (!confirmationId) return;

  if (action === 'approve') {
    confirmationController.approveConfirmation(confirmationId);
  } else if (action === 'approve-session') {
    confirmationController.approveConfirmation(confirmationId, 'session');
  } else if (action === 'approve-always') {
    confirmationController.approveConfirmation(confirmationId, 'always');
  } else {
    confirmationController.cancelConfirmation(confirmationId);
  }
}

/**
 * 将主进程 runtime 上下文用量快照转换为 renderer 工具栏使用的形状。
 * @param snapshot - 主进程 runtime 上下文用量快照
 * @returns renderer 上下文用量快照
 */
function toContextUsageBudgetSnapshot(snapshot: ChatRuntimeContextUsageSnapshot): ContextUsageBudgetSnapshot {
  return {
    usedTokens: snapshot.estimatedInputTokens,
    contextWindow: snapshot.contextWindow,
    reservedOutputTokens: snapshot.reservedOutputTokens,
    safetyMarginTokens: snapshot.compactionBufferTokens,
    usableInputTokens: snapshot.usableInputTokens,
    usagePercent: snapshot.usagePercent,
    remainingInputTokens: snapshot.remainingInputTokens,
    status: snapshot.status
  };
}

/**
 * 处理主进程 ChatRuntime 完成事件。
 * Runtime 已在主进程完成消息持久化，这里只做 UI 状态、用量刷新和自动命名。
 * @param nextMessage - runtime 完成的 assistant 消息
 */
async function handleRuntimeComplete(nextMessage: Message): Promise<void> {
  const sessionId = activeSessionId.value;
  const snapshot = captureAutoNameSnapshot(nextMessage, sessionId);

  if (sessionId) {
    await usagePanel.refresh(sessionId, currentSessionForAutoName.value?.id ?? sessionId);
  }

  if (!snapshot) return;

  scheduleAutoName(snapshot, () => workflowLoading.value);
}

/**
 * 打开模型范围的命令面板。
 */
function openModelCommandPanel(): void {
  commandPanelStore.openModel({
    onClose: () => promptEditorRef.value?.focus()
  });
}

/**
 * 显示"未找到模型配置"的 Toast 提示，引导用户去配置页。
 */
function showNoModelConfigToast(): void {
  interactionAPI.showToast({
    id: 'no-model-config-toast',
    content: h('div', [
      '未找到可用的模型配置，',
      h(
        'span',
        {
          class: 'text-primary underline cursor-pointer',
          onClick: () => {
            // 始终先关闭当前 Toast，避免与后续打开的对话框视觉堆叠
            removeToast('no-model-config-toast');
            if (hasAvailableModels.value) {
              // 已配置过模型，直接打开模型范围的命令面板让用户挑选
              openModelCommandPanel();
            } else {
              // 没有任何可用模型，跳转配置页
              emit('navigate-to-provider');
              router.push('/settings/provider');
            }
          }
        },
        '去配置'
      )
    ]),
    type: 'error',
    duration: 6000
  });
}

/** Chat 服务配置解析 hook。 */
const chatServiceConfig = useChatServiceConfig();
/** Runtime 请求配置解析 hook。 */
const { resolveRuntimeSystemPrompt, resolveRuntimeTavilyConfig, resolveRuntimeMcpRequestConfig } = useRuntimeConfig();
/** Runtime 请求准备与纯策略适配 hook。 */
const { prepareRuntimeRequest, resolveRuntimeRequestConfig: resolveChatRuntimeRequestConfig } = useRuntimeRequestConfig({
  contextWindow,
  workspaceRoot,
  resolveServiceConfig: chatServiceConfig.resolveServiceConfig,
  syncAIResources,
  getActiveTools,
  getSkillContentHashes,
  resolveRuntimeSystemPrompt,
  resolveRuntimeTavilyConfig,
  resolveRuntimeMcpRequestConfig,
  onMissingServiceConfig: showNoModelConfigToast
});

/** 当前应用级 Runtime Bridge 请求处理器。 */
const handleRuntimeBridgeRequest = useRuntimeBridgeHandler({ openDraft, openFileByPath, openWebview });
/** Session 状态机与 Runtime IPC 工作流。 */
const workflow = useChatWorkflow({
  messages,
  activeSessionId,
  contextWindow,
  workspaceRoot,
  supportsVision,
  actorSystem: chatActorSystem,
  sessionActor: chatSessionActor,
  getActiveTools,
  prepareRuntimeRequest,
  resolveRuntimeRequestConfig: resolveChatRuntimeRequestConfig,
  handleBridgeRequest: handleRuntimeBridgeRequest,
  confirmationController,
  ensureActiveSession,
  fetchAllPriorHistory,
  setLoadedMessages,
  persistMessages: (sessionId: string, nextMessages: Message[]): Promise<void> => chatStore.setSessionMessages(sessionId, nextMessages),
  updateSessionMessage: (sessionId: string | undefined, nextMessage: Message): Promise<void> => chatStore.updateSessionMessage(sessionId, nextMessage),
  restoreInput: inputEvents.restoreFromMessage,
  clearInput: inputEvents.clear,
  focusInput,
  scrollToBottom: (): void => conversationRef.value?.scrollToBottom({ behavior: 'auto' }),
  onRuntimeComplete: handleRuntimeComplete,
  onContextUsageUpdated: (snapshot: ChatRuntimeContextUsageSnapshot): void => {
    runtimeContextUsageSnapshot.value = toContextUsageBudgetSnapshot(snapshot);
  },
  onModelNotFound: showNoModelConfigToast,
  showRuntimeError: (message: string): void => interactionAPI.showToast({ type: 'error', content: message }),
  restoreTodoSnapshots: restoreTodoSnapshotsForMessages
});
handleSessionUIEvent = (event: ChatSessionUIEvent): void => {
  workflow.handleSessionUIEvent(event).catch((error: unknown) => {
    interactionAPI.showToast({ type: 'error', content: error instanceof Error ? error.message : '处理确认请求失败' });
  });
};
for (const event of pendingSessionUIEvents.splice(0)) {
  handleSessionUIEvent(event);
}
const {
  loading,
  chatSubmitter,
  rollbackController,
  handleCompactContext,
  handleRegenerate: handleChatRegenerate,
  abort: handleAbort,
  cancel: handleCancel,
  rollback: handleRollback
} = workflow;
/** 消息级交互仅在对应领域状态允许时开放。 */
const messageInteractionDisabled = computed<boolean>(() => {
  const sessionId = activeSessionId.value;
  const pendingInteraction = sessionId ? findPendingInteraction(messages.value, sessionId) : null;
  return pendingInteraction ? !chatSessionActor.waitingForUser.value : !loading.value;
});

/** 上下文窗口用量 hook（空闲态用 API 上报值，流式中用估算器）。 */
const { usedTokens, snapshot: contextUsageSnapshot } = useContextUsage({ messages, contextWindow, selectedModel, streaming: loading });
/** 当前展示给工具栏的上下文窗口用量快照。 */
const displayedContextUsageSnapshot = computed<ContextUsageBudgetSnapshot>(() => runtimeContextUsageSnapshot.value ?? contextUsageSnapshot.value);

watch(
  loading,
  (value: boolean): void => {
    workflowLoading.value = value;
    emit('loading-change', value);
  },
  { immediate: true }
);

/** 恢复指定消息到输入编辑器。 */
function handleChatEdit(nextMessage: Message): void {
  inputEvents.restoreFromMessage(nextMessage);
}

/**
 * 从目标助手消息创建独立会话分支。
 * @param message - 目标助手消息
 */
async function handleBranch(message: Message): Promise<void> {
  const sourceSessionId = activeSessionId.value;
  if (!sourceSessionId || branchingMessageId.value) return;

  branchingMessageId.value = message.id;
  const [error, session] = await asyncTo(chatStore.branchSession(sourceSessionId, message.id));
  branchingMessageId.value = undefined;

  if (error) {
    interactionAPI.showToast({ type: 'error', content: error.message || '创建会话分支失败' });
    return;
  }

  emit('session-created', session);
}

/**
 * 处理聊天消息提交。
 */
async function handleChatSubmit(): Promise<void> {
  const content = inputContent.value.trim();

  if (loading.value || !canSubmit.value) return;

  await workflow.submitUserTextMessage(content, inputImages.value);
}

/**
 * 处理模型变更（委托给 modelSelection hook）。
 * @param value - 新选中的模型标识
 */
function handleModelChange(model: { providerId: string; modelId: string }): void {
  modelSelectionEvents.onModelChange(model);
}

/** 斜杠命令处理 hook */
const { handleSlashCommand } = useSlashCommands({
  openModelSelector: openModelCommandPanel,
  openUsagePanel: () => usagePanel.openPanel(activeSessionId.value ?? undefined),
  createNewSession: createDraftSession,
  clearInput: () => inputEvents.clear(),
  compactContext: handleCompactContext,
  isBusy: () => loading.value,
  onBusyCommandRejected: (commandId: string) => {
    if (commandId === 'compact') {
      interactionAPI.showToast({ content: '当前消息仍在生成中，请先停止或等待完成', type: 'info' });
    }
  }
});

/** 组件卸载时清理 */
onUnmounted(() => {
  workflow.dispose();
  confirmationController.dispose();
});

/** 暴露聚焦输入框方法供父组件调用 */
defineExpose({ focusInput });
</script>

<style lang="less">
.b-chat__container {
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 0;
}

.b-chat__toolbar {
  padding: 8px 12px 12px;

  &:empty {
    display: none;
  }
}

.b-chat__conversation-container {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 0;
}

.b-chat__floating-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px 16px;
  pointer-events: none;

  &:empty {
    display: none;
  }

  & > * {
    pointer-events: auto;
  }
}

.b-chat__input {
  padding: 12px;
  border-top: 1px solid var(--border-primary);
}

.b-chat__input-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: var(--b-chat-max-width, 800px);
  padding: 12px;
  margin: 0 auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  transition: background 0.3s ease-in-out, border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;

  &.b-chat__input-container--dragover {
    background: var(--color-primary-bg);
    border-color: var(--input-focus-border);
    box-shadow: inset 0 0 0 1px var(--color-control-outline);
  }
}

.b-chat__input-container .b-text-editor {
  flex: 1;
  min-width: 0;
  padding: 0;
  background-color: transparent;
  border: none;
  border-radius: 0;
}

.b-chat__input-container .b-text-editor:focus-within {
  box-shadow: none;
}
</style>

<!--
  @file index.vue
  @description 聊天侧边栏组件，包含会话管理、消息列表、输入框和模型选择功能。
-->
<template>
  <div :class="bem('container')">
    <div :class="bem('conversation-container')">
      <ConversationView
        ref="conversationRef"
        v-model:messages="messages"
        :loading="loading"
        :disabled="!loading"
        :on-load-history="handleLoadHistory"
        :can-rollback="rollbackController.canRollback"
        @edit="handleChatEdit"
        @regenerate="handleChatRegenerate"
        @user-choice-submit="handleChatUserChoiceSubmit"
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
      <div ref="inputContainerRef" :class="bem('input-container', { dragover: isInputDragActive })">
        <ImagePreview :images="inputImages" :supports-vision="supportsVision" :on-remove-image="inputEvents.removeImage" />

        <BPromptEditor
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
import type { AIUserChoiceAnswerData, ChatMessageConfirmationAction, ChatSession } from 'types/chat';
import type { ChatRuntimeContextUsageSnapshot } from 'types/chat-runtime';
import { computed, h, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { cloneDeep } from 'lodash-es';
import type { ContextUsageBudgetSnapshot } from '@@/shared/ai/context/usageBudget.ts';
import { editorToolContextRegistry } from '@/ai/tools/context/editor';
import { webviewToolContextRegistry } from '@/ai/tools/context/webview';
import { toTransportTools } from '@/ai/tools/stream';
import BPromptEditor from '@/components/BPromptEditor/index.vue';
import type { FileMentionOption } from '@/components/BPromptEditor/types';
import { useFileDrop } from '@/hooks/useFileDrop';
import { useNavigate } from '@/hooks/useNavigate';
import { native } from '@/shared/platform';
import { getElectronAPI, unwrap } from '@/shared/platform/electron-api';
import { useProviderStore } from '@/stores/ai/provider';
import { useChatSessionStore } from '@/stores/chat/session';
import { useCommandPanelStore } from '@/stores/ui/commandPanel';
import { useFilesStore } from '@/stores/workspace/files';
import type { FileReferenceNavigationTarget } from '@/utils/file/reference';
import { Modal } from '@/utils/modal';
import { createNamespace } from '@/utils/namespace';
import ConfirmationSheet from './components/ConfirmationSheet.vue';
import ConversationView from './components/ConversationView.vue';
import ImagePreview from './components/ImagePreview.vue';
import InputToolbar from './components/InputToolbar.vue';
import InteractionContainer from './components/InteractionContainer/index.vue';
import TodoPanel from './components/TodoPanel.vue';
import UsagePanel from './components/UsagePanel.vue';
import { useAutoName } from './hooks/useAutoName';
import { useChatHistory } from './hooks/useChatHistory';
import { useChatInput } from './hooks/useChatInput';
import { useChatRuntime } from './hooks/useChatRuntime';
import { useChatServiceConfig } from './hooks/useChatServiceConfig';
import { useChatTaskRuntime } from './hooks/useChatTaskRuntime';
import { useContextUsage } from './hooks/useContextUsage';
import { useFileReference } from './hooks/useFileReference';
import { useImageUpload } from './hooks/useImageUpload';
import { useInteractionState } from './hooks/useInteractionState';
import { useModelSelection } from './hooks/useModelSelection';
import { useRollback } from './hooks/useRollback';
import { useRuntimeCompactContext } from './hooks/useRuntimeCompactContext';
import { useRuntimeConfig } from './hooks/useRuntimeConfig';
import { useRuntimeSettings } from './hooks/useRuntimeSettings';
import { useRuntimeTools } from './hooks/useRuntimeTools';
import { useSkillInit } from './hooks/useSkillInit';
import { useSlashCommands, chatSlashCommands } from './hooks/useSlashCommands';
import { useTodoPanel } from './hooks/useTodoPanel';
import { useUsagePanel } from './hooks/useUsagePanel';
import { useVoiceInput } from './hooks/useVoiceInput';
import { createFileRefChipResolver } from './utils/chipResolver';
import { createChatConfirmationController } from './utils/confirmationController';
import { buildUserInputParts } from './utils/filePartParser';
import { create, userChoice } from './utils/messageHelper';
import { handleBChatRuntimeBridgeRequest } from './utils/runtimeBridge';
import { appendRuntimeErrorMessage } from './utils/runtimeError';
import { createWidgetSkillDraftAssistantMessage, resolveWidgetSkillDraft } from './utils/widgetSkillDraft';

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

/** BChat 内部为新会话草稿创建出的会话 ID。 */
const createdSessionId = ref<string | null>(null);
/** 自动命名时需要的当前会话镜像。 */
const currentSessionForAutoName = ref<{ id: string; title: string } | undefined>(undefined);
/** 当前聊天运行时使用的有效会话 ID。 */
const activeSessionId = computed<string | null>(() => props.sessionId ?? createdSessionId.value);
/** Todo 面板状态和回退恢复能力。 */
const { currentSessionTodos, todoPanelVisible, todoPanelDismissed, restoreTodoSnapshotsForMessages } = useTodoPanel({ activeSessionId });

const router = useRouter();

/** 交互容器状态 */
const { api: interactionAPI, toastQueue, removeToast } = useInteractionState();

/** 提供交互 API */
provide('interaction', interactionAPI);

/** 输入框编辑器引用 */
const promptEditorRef = ref<InstanceType<typeof BPromptEditor>>();
/** 输入框容器引用 */
const inputContainerRef = ref<HTMLElement>();
/** 通用文件打开导航能力 */
const { openFile, openWebview } = useNavigate();
/** 全局命令面板 Store。 */
const commandPanelStore = useCommandPanelStore();
/** Provider 数据源。 */
const providerStore = useProviderStore();
/** 是否存在至少一个已启用的模型，用于「去配置」点击分支。 */
const hasAvailableModels = computed<boolean>(() => providerStore.availableModels.length > 0);
/** 对话视图引用 */
const conversationRef = ref<InstanceType<typeof ConversationView>>();

/** 聊天历史加载状态和方法 */
const { setLoadedMessages, fetchAllPriorHistory, messages, hasMoreHistory, loadHistory } = useChatHistory();

/** 确认控制器，管理工具调用的用户确认流程 */
const confirmationController = createChatConfirmationController();
/** Runtime 可读写设置能力。 */
const { getSettingsSnapshot, applyRuntimeSetting } = useRuntimeSettings();
/** Runtime 内置工具能力。 */
const { workspaceRoot, getActiveTools, openDraft, openFileByPath } = useRuntimeTools({
  messages,
  confirm: confirmationController.createAdapter(),
  getSessionId: () => activeSessionId.value ?? undefined,
  openWebview
});

/** 聚焦输入框 */
function focusInput(options?: { moveToEnd?: boolean }): void {
  promptEditorRef.value?.focus?.(options);
}

/**
 * 处理输入框中的文件引用 chip 打开动作。
 * @param target - 文件导航目标
 */
function handleOpenPromptFileReference(target: FileReferenceNavigationTarget): void {
  openFile({
    filePath: target.filePath,
    fileId: target.fileId,
    fileName: target.fileName,
    range: {
      startLine: target.startLine,
      endLine: target.endLine
    }
  });
}

/** PromptEditor 使用的文件引用 chip resolver。 */
const promptChipResolver = createFileRefChipResolver(handleOpenPromptFileReference);

/** 保存输入框光标位置 */
function saveCursorPosition(): void {
  promptEditorRef.value?.saveCursorPosition();
}

/** 插入文本到光标位置 */
function insertTextAtCursor(text: string): void {
  promptEditorRef.value?.insertTextAtCursor(text);
}

/** 语音输入转写事件处理器。 */
const { handleVoiceStart, handleVoicePartial, handleVoiceComplete } = useVoiceInput({
  editor: {
    saveCursorPosition,
    getCursorPosition: () => promptEditorRef.value?.getCursorPosition() ?? 0,
    replaceTextRange: (from: number, to: number, text: string) => {
      promptEditorRef.value?.replaceTextRange(from, to, text);
    },
    insertTextAtCursor
  },
  showEmptyTranscriptionToast: () => {
    interactionAPI.showToast({ content: '语音转写结果为空，请重试', type: 'error' });
  }
});

/** 用量面板 hook */
const usagePanel = useUsagePanel();

/** 草稿输入 hook */
const { inputContent, inputImages, ...inputEvents } = useChatInput({ focusInput });

/** 模型选择 hook */
const { selectedModel, supportsVision, contextWindow, ...modelSelectionEvents } = useModelSelection();

/** 图片上传 hook */
const imageUpload = useImageUpload({ supportsVision, inputEvents: { ...inputEvents, inputImages }, showToast: interactionAPI.showToast });

/** 当前是否允许提交消息（文本非空 或 有图片） */
const canSubmit = computed<boolean>(() => !inputEvents.isEmpty() || inputEvents.hasImages());

/** 文件引用 hook */
const fileReference = useFileReference({
  insertTextAtCursor,
  saveCursorPosition,
  focusInput
});

/**
 * 处理投放到输入容器的文件。
 * @param files - 拖拽文件列表
 */
async function handleInputDropFiles(files: File[]): Promise<void> {
  const imageFiles = files.filter((file) => file.type.startsWith('image/'));
  const otherFiles = files.filter((file) => !file.type.startsWith('image/'));

  if (imageFiles.length > 0) {
    await imageUpload.appendImages(imageFiles);
  }

  if (otherFiles.length > 0) {
    const tokenText = fileReference.onPasteFiles(otherFiles);
    if (tokenText) {
      insertTextAtCursor(tokenText);
    }
  }
}

/** 输入容器文件拖拽 hook */
const { isDragging: isInputDragActive } = useFileDrop({
  targetRef: inputContainerRef,
  onDropFiles: handleInputDropFiles
});

/** 文件存储，用于文件提及和 bridge 文件查询。 */
const filesStore = useFilesStore();

/** 最近文件列表，用于 @ 文件提及功能（实时响应 filesStore.recentFiles） */
const fileMentionOptions = computed<FileMentionOption[]>(() => {
  const files = filesStore.recentFiles ?? [];
  return files.filter((file) => file.ext.toLowerCase() === 'md').map((file) => ({ id: file.id, name: file.name, path: file.path, ext: file.ext }));
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
 * 消息重新生成前的处理函数。
 * @param nextMessages - 重新生成后的消息列表
 */
async function handleBeforeRegenerate(nextMessages: Message[]): Promise<void> {
  confirmationController.expirePendingConfirmation();
  const sessionId = activeSessionId.value;
  if (!sessionId) return;

  const historyMessages = await fetchAllPriorHistory(sessionId);
  await chatStore.setSessionMessages(sessionId, [...historyMessages, ...nextMessages]);
}

/**
 * 确保当前发送动作有可持久化的会话。
 * @param title - 新会话标题
 * @returns 有效会话 ID
 */
async function ensureActiveSession(title: string): Promise<string> {
  if (activeSessionId.value) {
    return activeSessionId.value;
  }

  const session = await chatStore.createSession('assistant', { title });
  createdSessionId.value = session.id;
  currentSessionForAutoName.value = session;
  emit('session-created', session);
  return session.id;
}

/**
 * 将本地小组件草稿消息写入当前会话并刷新可见消息。
 * @param sessionId - 当前会话 ID
 * @param visibleMessages - 写入后的可见消息列表
 */
async function persistLocalWidgetSkillDraftMessages(sessionId: string, visibleMessages: Message[]): Promise<void> {
  const historyMessages = await fetchAllPriorHistory(sessionId);
  await chatStore.setSessionMessages(sessionId, [...historyMessages, ...visibleMessages]);
  setLoadedMessages(visibleMessages);
  await nextTick();
  conversationRef.value?.scrollToBottom({ behavior: 'auto' });
}

/** Chat 服务配置解析 hook。 */
const chatServiceConfig = useChatServiceConfig();
/** Runtime 请求配置解析 hook。 */
const { resolveRuntimeSystemPrompt, resolveRuntimeTavilyConfig, resolveRuntimeMcpRequestConfig } = useRuntimeConfig();

/** 当前 runtime 聊天任务的中止函数。 */
let abortRuntimeChatTask: (() => Promise<void>) | null = null;

/** 统一任务运行时。 */
const taskRuntime = useChatTaskRuntime({
  abortChatTask: async () => {
    await abortRuntimeChatTask?.();
  }
});

/** 当前是否有活跃任务。 */
const loading = computed<boolean>(() => taskRuntime.loading.value);

/** 上下文窗口用量 hook（混合策略：空闲态用 API 上报值，流式中用估算器） */
const { usedTokens, snapshot: contextUsageSnapshot } = useContextUsage({ messages, contextWindow, selectedModel, streaming: loading });
/** 主进程 runtime 上报的上下文窗口用量快照。 */
const runtimeContextUsageSnapshot = ref<ContextUsageBudgetSnapshot | undefined>(undefined);
/** 当前展示给工具栏的上下文窗口用量快照。 */
const displayedContextUsageSnapshot = computed<ContextUsageBudgetSnapshot>(() => runtimeContextUsageSnapshot.value ?? contextUsageSnapshot.value);

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

watch(
  loading,
  (value) => {
    emit('loading-change', value);
  },
  { immediate: true }
);

/**
 * 重置新会话草稿态。
 */
async function resetDraftSessionState(): Promise<void> {
  confirmationController.dispose();
  createdSessionId.value = null;
  currentSessionForAutoName.value = undefined;
  runtimeContextUsageSnapshot.value = undefined;
  usagePanel.reset();
  setLoadedMessages([]);
  hasMoreHistory.value = false;
  await nextTick();
  focusInput();
}

/**
 * 加载指定会话消息。
 * @param sessionId - 会话 ID
 */
async function loadSessionMessages(sessionId: string): Promise<void> {
  confirmationController.dispose();
  usagePanel.reset();
  runtimeContextUsageSnapshot.value = undefined;
  hasMoreHistory.value = false;
  setLoadedMessages(await chatStore.getSessionMessages(sessionId));
}

watch(
  () => props.sessionId,
  async (nextSessionId) => {
    if (nextSessionId && nextSessionId === createdSessionId.value) {
      createdSessionId.value = null;
      return;
    }

    if (!nextSessionId) {
      await resetDraftSessionState();
      return;
    }

    createdSessionId.value = null;
    currentSessionForAutoName.value = undefined;
    await loadSessionMessages(nextSessionId);
  },
  { immediate: true }
);

/**
 * 进入新会话草稿态。
 */
async function createDraftSession(): Promise<void> {
  if (loading.value) return;

  await resetDraftSessionState();
  emit('draft-session-created');
}

/** 自动命名 Hook。 */
const { captureSnapshot, scheduleAutoName } = useAutoName({
  getCurrentSession: () => currentSessionForAutoName.value,
  getFirstRoundContent: (nextMessage) => {
    // 首轮如果仍在等待用户补充输入，则不应提前触发自动命名
    if (userChoice.findPending(messages.value)) {
      return null;
    }

    // 仅在首轮恰好形成一问一答时才参与自动命名
    const userMessages = messages.value.filter((item) => item.role === 'user');
    const assistantMessages = messages.value.filter((item) => item.role === 'assistant');
    if (userMessages.length !== 1 || assistantMessages.length !== 1) return null;

    return {
      userMessage: userMessages[0].content,
      aiResponse: nextMessage.content
    };
  },
  onTitlePersisted: (sessionId, title) => {
    emit('session-title-persisted', sessionId, title);
  }
});

/**
 * 处理主进程 ChatRuntime 完成事件。
 * Runtime 已在主进程完成消息持久化，这里只做 UI 状态、用量刷新和自动命名。
 * @param nextMessage - runtime 完成的 assistant 消息
 */
async function handleRuntimeComplete(nextMessage: Message): Promise<void> {
  const sessionId = activeSessionId.value;
  const snapshot = captureSnapshot(nextMessage, sessionId);

  try {
    if (sessionId) {
      await usagePanel.refresh(sessionId, currentSessionForAutoName.value?.id ?? sessionId);
    }
  } finally {
    taskRuntime.finishTask('chat');
  }

  if (!snapshot) return;

  scheduleAutoName(snapshot, () => loading.value);
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

/** 已被回退删除的 runtime ID 集合，用于丢弃迟到的主进程事件。 */
const rollbackIgnoredRuntimeIds = new Set<string>();

/**
 * 记录回退删除区间内的 runtime ID。
 * @param rolledBackMessages - 本次回退删除的消息列表
 */
function rememberRolledBackRuntimeIds(rolledBackMessages: Message[]): void {
  for (const message of rolledBackMessages) {
    if (message.runtimeId) {
      rollbackIgnoredRuntimeIds.add(message.runtimeId);
    }
  }
}

/**
 * 判断 runtime 事件是否已被回退流程作废。
 * @param runtimeId - runtime ID
 * @returns 是否忽略该 runtime 的迟到事件
 */
function isRollbackRuntimeEventIgnored(runtimeId: string): boolean {
  return rollbackIgnoredRuntimeIds.has(runtimeId);
}

/** 主进程 ChatRuntime hook。 */
const chatRuntime = useChatRuntime({
  messages,
  getSessionId: () => activeSessionId.value ?? undefined,
  tools: getActiveTools,
  getToolContext: editorToolContextRegistry.getCurrentContext,
  isRuntimeEventIgnored: isRollbackRuntimeEventIgnored,
  requestConfirmation: (request) => confirmationController.requestConfirmation(request),
  handleBridgeRequest: (event) =>
    handleBChatRuntimeBridgeRequest(event, {
      getEditorContext: editorToolContextRegistry.getCurrentContext,
      getEditorContextByDocumentId: (documentId) => editorToolContextRegistry.getContext(documentId),
      findFileByPath: async (filePath) => {
        const file = await filesStore.getFileByPath(filePath);
        return file ? { id: file.id } : null;
      },
      getRecentFileById: (fileId) => filesStore.getFileById(fileId),
      updateRecentFileById: (fileId, updates) => filesStore.updateFile(fileId, updates),
      getWebviewContext: webviewToolContextRegistry.getCurrentContext,
      getSettingsSnapshot,
      applySetting: applyRuntimeSetting,
      openDraft,
      openFileByPath,
      openInWebview: (url) => {
        openWebview(new URL(url));
      },
      openExternal: (url) => native.openExternal(url)
    }),
  onComplete: handleRuntimeComplete,
  onContextUsageUpdated: (snapshot) => {
    runtimeContextUsageSnapshot.value = toContextUsageBudgetSnapshot(snapshot);
  },
  onError: async (error) => {
    if (error.code === 'MODEL_NOT_FOUND') {
      showNoModelConfigToast();
      return;
    }

    const sessionId = activeSessionId.value;
    if (!sessionId) {
      interactionAPI.showToast({ type: 'error', content: error.message });
      return;
    }

    await appendRuntimeErrorMessage({
      sessionId,
      content: error.message,
      visibleMessages: messages.value,
      fetchAllPriorHistory,
      persistMessages: (targetSessionId, nextMessages) => chatStore.setSessionMessages(targetSessionId, nextMessages),
      setLoadedMessages,
      afterMessagesUpdated: async () => {
        await nextTick();
        conversationRef.value?.scrollToBottom({ behavior: 'auto' });
      }
    });
  }
});

abortRuntimeChatTask = () => chatRuntime.abort();

/**
 * 处理消息编辑。
 * @param nextMessage - 要编辑的消息
 */
function handleChatEdit(nextMessage: Message): void {
  inputEvents.restoreFromMessage(nextMessage);
}

/** 手动上下文压缩命令 hook。 */
const { handleCompactContext } = useRuntimeCompactContext({
  messages,
  getSessionId: () => activeSessionId.value ?? undefined,
  getContextWindow: () => contextWindow.value,
  beginCompactTask: (onAbort) => taskRuntime.beginTask('compact', onAbort),
  finishCompactTask: () => taskRuntime.finishTask('compact'),
  scrollToBottom: () => conversationRef.value?.scrollToBottom({ behavior: 'auto' }),
  isRuntimeEventIgnored: isRollbackRuntimeEventIgnored
});

/**
 * 查找重新生成时需要保留到哪条 user 消息。
 * @param targetMessage - 目标 assistant 消息
 * @returns 起始 user 消息索引，不存在时返回 -1
 */
function findRuntimeRegenerateStartIndex(targetMessage: Message): number {
  const targetIndex = messages.value.findIndex((item) => item.id === targetMessage.id);
  if (targetIndex === -1 || targetMessage.role !== 'assistant') {
    return -1;
  }

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    if (messages.value[index].role === 'user') {
      return index;
    }
  }

  return -1;
}

/**
 * 通过主进程 ChatRuntime 重新生成 assistant 回复。
 * @param targetMessage - 要重新生成的 assistant 消息
 * @returns 是否成功启动 runtime
 */
async function startRuntimeRegenerate(targetMessage: Message): Promise<boolean> {
  const startIndex = findRuntimeRegenerateStartIndex(targetMessage);
  if (startIndex === -1) {
    return false;
  }

  const sessionId = activeSessionId.value;
  if (!sessionId) {
    return false;
  }

  const sourceMessages = messages.value.slice(0, startIndex + 1);
  const removedMessages = messages.value.slice(startIndex + 1);
  messages.value.splice(0, messages.value.length, ...sourceMessages);

  const config = await chatServiceConfig.resolveServiceConfig();
  if (!config) {
    messages.value.splice(0, messages.value.length, ...sourceMessages, ...removedMessages);
    showNoModelConfigToast();
    return false;
  }

  await handleBeforeRegenerate(sourceMessages);
  await chatRuntime.continueTurn({
    sessionId,
    messages: sourceMessages,
    contextWindow: contextWindow.value,
    system: await resolveRuntimeSystemPrompt(),
    workspaceRoot: workspaceRoot.value || undefined,
    tools: config.toolSupport.supported ? toTransportTools(getActiveTools()) : undefined,
    tavily: resolveRuntimeTavilyConfig(),
    mcp: resolveRuntimeMcpRequestConfig()
  });

  return true;
}

/**
 * 处理消息重新生成。
 * @param nextMessage - 要重新生成的消息
 */
async function handleChatRegenerate(nextMessage: Message): Promise<void> {
  const startResult = taskRuntime.beginTask('chat');
  if (!startResult.ok) {
    return;
  }

  try {
    const regenerated = await startRuntimeRegenerate(nextMessage);
    if (!regenerated) {
      taskRuntime.finishTask('chat');
    }
  } catch (error) {
    taskRuntime.finishTask('chat');
    throw error;
  }
}

/**
 * 处理用户选择提交。
 * @param answer - 用户选择的答案数据
 */
async function handleChatUserChoiceSubmit(answer: AIUserChoiceAnswerData): Promise<void> {
  const isActiveChatTask = taskRuntime.activeTask.value === 'chat';
  if (!isActiveChatTask) {
    const startResult = taskRuntime.beginTask('chat');
    if (!startResult.ok) {
      return;
    }
  }

  try {
    const sessionId = activeSessionId.value;
    if (!sessionId) {
      taskRuntime.finishTask('chat');
      return;
    }

    const config = await chatServiceConfig.resolveServiceConfig();
    if (!config) {
      showNoModelConfigToast();
      taskRuntime.finishTask('chat');
      return;
    }

    const result = await chatRuntime.submitUserChoice({
      sessionId,
      contextWindow: contextWindow.value,
      system: await resolveRuntimeSystemPrompt(),
      workspaceRoot: workspaceRoot.value || undefined,
      answer,
      tools: config.toolSupport.supported ? toTransportTools(getActiveTools()) : undefined,
      tavily: resolveRuntimeTavilyConfig(),
      mcp: resolveRuntimeMcpRequestConfig()
    });
    if (result.completed === true) {
      taskRuntime.finishTask('chat');
    }
  } catch (error) {
    taskRuntime.finishTask('chat');
    throw error;
  }
}

/** 用户消息回退 hook。 */
const rollbackController = useRollback({
  messages,
  getSessionId: () => activeSessionId.value ?? undefined,
  fetchAllPriorHistory,
  persistMessages: (sessionId, nextMessages) => chatStore.setSessionMessages(sessionId, nextMessages),
  invalidateCompressionRecords: async (recordIds) => {
    for (const recordId of recordIds) {
      // eslint-disable-next-line no-await-in-loop
      const result = await getElectronAPI().chatCompressionUpdateStatus(recordId, 'invalid', 'rollback_truncation');
      unwrap(result);
    }
  },
  restoreInput: (nextMessage) => inputEvents.restoreFromMessage(nextMessage),
  expireConfirmation: () => confirmationController.expirePendingConfirmation(),
  focusInput
});

/**
 * 提交用户文本消息并启动新一轮流式对话。
 * @param content - 用户输入内容
 * @param images - 可选图片列表
 * @param clearDraft - 是否清空当前主输入框草稿
 */
async function submitUserTextMessage(content: string, images: typeof inputImages.value = [], clearDraft = true): Promise<void> {
  const trimmedContent = content.trim();
  if (!trimmedContent && !images.length) return;

  const startResult = taskRuntime.beginTask('chat');
  if (!startResult.ok) return;

  let pendingSessionId: string | null = null;
  let pendingUserMessage: Message | null = null;

  try {
    const userMessage = create.userMessage(trimmedContent);
    if (images.length && supportsVision.value) {
      userMessage.files = [...images];
    }

    const widgetDraft = images.length ? null : resolveWidgetSkillDraft(trimmedContent);
    if (widgetDraft) {
      const sessionId = await ensureActiveSession(userMessage.content);
      pendingSessionId = sessionId;
      pendingUserMessage = userMessage;
      confirmationController.expirePendingConfirmation();
      focusInput();
      clearDraft && inputEvents.clear();

      await persistLocalWidgetSkillDraftMessages(sessionId, [...messages.value, userMessage, createWidgetSkillDraftAssistantMessage(widgetDraft)]);
      taskRuntime.finishTask('chat');
      return;
    }

    const config = await chatServiceConfig.resolveServiceConfig();
    if (!config) {
      showNoModelConfigToast();
      taskRuntime.finishTask('chat');
      return;
    }

    const userParts = buildUserInputParts(trimmedContent, workspaceRoot.value || undefined);
    const sessionId = await ensureActiveSession(userMessage.content);
    pendingSessionId = sessionId;
    pendingUserMessage = userMessage;
    confirmationController.expirePendingConfirmation();
    focusInput();
    clearDraft && inputEvents.clear();

    conversationRef.value?.scrollToBottom({ behavior: 'auto' });

    await chatRuntime.send({
      sessionId,
      content: userMessage.content,
      contextWindow: contextWindow.value,
      system: await resolveRuntimeSystemPrompt(),
      workspaceRoot: workspaceRoot.value || undefined,
      parts: userParts,
      tools: config.toolSupport.supported ? toTransportTools(getActiveTools()) : undefined,
      tavily: resolveRuntimeTavilyConfig(),
      mcp: resolveRuntimeMcpRequestConfig(),
      files: userMessage.files,
      userMessageId: userMessage.id,
      userMessageCreatedAt: userMessage.createdAt
    });
  } catch (error) {
    taskRuntime.finishTask('chat');
    const message = error instanceof Error ? error.message : '发送消息失败';
    if (pendingSessionId && pendingUserMessage) {
      await appendRuntimeErrorMessage({
        sessionId: pendingSessionId,
        content: message,
        visibleMessages: messages.value,
        precedingMessage: pendingUserMessage,
        fetchAllPriorHistory,
        persistMessages: (targetSessionId, nextMessages) => chatStore.setSessionMessages(targetSessionId, nextMessages),
        setLoadedMessages,
        afterMessagesUpdated: async () => {
          await nextTick();
          conversationRef.value?.scrollToBottom({ behavior: 'auto' });
        }
      });
      return;
    }

    interactionAPI.showToast({ type: 'error', content: message });
  }
}

/**
 * 处理聊天消息提交。
 */
async function handleChatSubmit(): Promise<void> {
  const content = inputContent.value.trim();

  if (loading.value || !canSubmit.value) return;

  await submitUserTextMessage(content, inputImages.value);
}

/**
 * 取消等待用户补充输入的问题，并写入中断状态消息。
 * @returns 是否处理了等待用户输入的中止
 */
async function abortPendingUserChoiceIfNeeded(): Promise<boolean> {
  const sessionId = activeSessionId.value;
  if (!sessionId) {
    return false;
  }

  const nextMessages = cloneDeep(messages.value);
  const cancelledAssistantMessage = userChoice.cancelPending(nextMessages);
  if (!cancelledAssistantMessage) {
    return false;
  }

  const visibleMessages = [...nextMessages, create.interruptMessage(cancelledAssistantMessage)];
  const historyMessages = await fetchAllPriorHistory(sessionId);
  await chatStore.setSessionMessages(sessionId, [...historyMessages, ...visibleMessages]);
  setLoadedMessages(visibleMessages);
  await nextTick();
  conversationRef.value?.scrollToBottom({ behavior: 'auto' });

  return true;
}

/**
 * 处理中止流式输出。
 * 交由当前活跃任务运行时区分聊天生成与上下文压缩取消。
 */
async function handleAbort(): Promise<void> {
  confirmationController.expirePendingConfirmation();

  if (taskRuntime.activeTask.value !== 'compact' && !chatRuntime.activeRuntimeId.value && (await abortPendingUserChoiceIfNeeded())) {
    taskRuntime.finishTask('chat');
    return;
  }

  await taskRuntime.abortActiveTask();
}

/**
 * 处理 ESC 取消操作：流式输出中则中止。
 */
async function handleCancel(): Promise<void> {
  if (loading.value) {
    await handleAbort();
  }
}

/**
 * 处理回退请求。
 * 弹出二次确认后执行截断、恢复输入框。
 * @param message - 目标用户消息
 */
async function handleRollback(message: Message): Promise<void> {
  const index = messages.value.findIndex((m) => m.id === message.id);
  if (index === -1) return;

  // 流式输出期间先中止，避免截断与流式追加产生竞态
  if (loading.value) {
    await handleAbort();
  }

  const afterCount = messages.value.length - index - 1;
  const [cancelled] = await Modal.confirm('确认回退', `将删除该用户消息及其后的 ${afterCount} 条消息。此操作不可撤销，是否继续？`, {
    confirmText: '确认回退',
    cancelText: '取消'
  });
  if (cancelled) return;

  const rolledBackMessages = messages.value.slice(index);
  rememberRolledBackRuntimeIds(rolledBackMessages);
  await rollbackController.rollback(message);
  restoreTodoSnapshotsForMessages(activeSessionId.value, rolledBackMessages);
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

/** 加载历史消息 */
async function handleLoadHistory(): Promise<void> {
  const sessionId = activeSessionId.value;
  if (!sessionId) return;

  await loadHistory(sessionId);
}

/**
 * 处理文件提及选择事件。
 * @param file - 选中的文件
 */
function handleFileMentionSelect(file: FileMentionOption): void {
  // 文件提及已经在 BPromptEditor 中插入到输入框
  console.log('File mention selected:', file.name);
}

/** Skill 初始化 hook */
useSkillInit();

/** 组件挂载时初始化 */
onMounted(async () => {
  await modelSelectionEvents.loadSelectedModel();
  // 确保 filesStore 已加载最近文件列表
  await filesStore.ensureLoaded();
});

/** 组件卸载时清理 */
onUnmounted(() => {
  taskRuntime.dispose();
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

.b-chat__input-container .b-prompt-editor {
  flex: 1;
  min-width: 0;
  padding: 0;
  background-color: transparent;
  border: none;
  border-radius: 0;
}

.b-chat__input-container .b-prompt-editor:focus-within {
  box-shadow: none;
}
</style>

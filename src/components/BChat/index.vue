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
          :context-usage="contextUsageSnapshot"
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

  <!-- 全局模型选择器 -->
  <BModelSelect ref="modelSelectRef" v-model:open="modelSelectOpen" :model="selectedModel" @change="handleGlobalModelChange" />
</template>

<script setup lang="ts">
import type { BChatProps, Message } from './utils/types';
import type { AIToolExecutor } from 'types/ai';
import type { AIUserChoiceAnswerData, ChatMessageConfirmationAction, ChatSession } from 'types/chat';
import { computed, h, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { throttle } from 'lodash-es';
import {
  createBuiltinTools,
  isBuiltinToolName,
  APPLY_DRAWING_OPERATIONS_TOOL_NAME,
  READ_CURRENT_DRAWING_TOOL_NAME,
  READ_CURRENT_WEBPAGE_TOOL_NAME,
  READ_DIRECTORY_TOOL_NAME,
  SKILL_TOOL_NAME,
  UPDATE_CURRENT_DRAWING_TOOL_NAME
} from '@/ai/tools/builtin';
import { createSkillTool } from '@/ai/tools/builtin/SkillTool';
import { drawingToolContextRegistry } from '@/ai/tools/context/drawing';
import { editorToolContextRegistry } from '@/ai/tools/context/editor';
import { webviewToolContextRegistry } from '@/ai/tools/context/webview';
import BModelSelect from '@/components/BModelSelect/index.vue';
import BPromptEditor from '@/components/BPromptEditor/index.vue';
import type { FileMentionOption } from '@/components/BPromptEditor/types';
import { useFileDrop } from '@/hooks/useFileDrop';
import { useNavigate } from '@/hooks/useNavigate';
import { useOpenDraft } from '@/hooks/useOpenDraft';
import { useOpenFile } from '@/hooks/useOpenFile';
import { useWorkspaceRoot } from '@/hooks/useWorkspaceRoot';
import { native } from '@/shared/platform';
import { getElectronAPI, unwrap } from '@/shared/platform/electron-api';
import { useSkillStore } from '@/stores/ai/skill';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';
import { useChatSessionStore } from '@/stores/chat/session';
import { useTodoStore } from '@/stores/chat/todo';
import type { TodoItem } from '@/stores/chat/todo';
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
import { useChatStream } from './hooks/useChatStream';
import { useChatTaskRuntime } from './hooks/useChatTaskRuntime';
import { useCompactContext } from './hooks/useCompactContext';
import { useContextUsage } from './hooks/useContextUsage';
import { useFileReference } from './hooks/useFileReference';
import { useImageUpload } from './hooks/useImageUpload';
import { useInteractionState } from './hooks/useInteractionState';
import { useModelSelection } from './hooks/useModelSelection';
import { useRollback } from './hooks/useRollback';
import { useSkillInit } from './hooks/useSkillInit';
import { useSlashCommands, chatSlashCommands } from './hooks/useSlashCommands';
import { useUsagePanel } from './hooks/useUsagePanel';
import { createFileRefChipResolver } from './utils/chipResolver';
import { shouldAutoCompactByContextUsage } from './utils/compression/policy';
import { createChatConfirmationController } from './utils/confirmationController';
import { create, userChoice, buildMessageReferences } from './utils/messageHelper';

const [, bem] = createNamespace('chat');

const props = withDefaults(defineProps<BChatProps>(), {
  sessionId: null
});

const emit = defineEmits<{
  (e: 'session-created', session: ChatSession): void;
  (e: 'session-title-persisted', sessionId: string, title: string): void;
  (e: 'draft-session-created'): void;
  (e: 'loading-change', loading: boolean): void;
}>();

/** assistant 草稿节流持久化间隔。 */
const ASSISTANT_DRAFT_PERSIST_INTERVAL_MS = 500;

/** 聊天数据存储 */
const chatStore = useChatSessionStore();
/** Skill 存储 */
const skillStore = useSkillStore();
const toolSettingsStore = useToolSettingsStore();

/** Todo 存储 */
const todoStore = useTodoStore();
/** Todo 面板可见性 */
const todoPanelVisible = ref(true);
/** Todo 面板是否已因当前任务全部结束而隐藏 */
const todoPanelDismissed = ref(false);
/** BChat 内部为新会话草稿创建出的会话 ID。 */
const createdSessionId = ref<string | null>(null);
/** 自动命名时需要的当前会话镜像。 */
const currentSessionForAutoName = ref<{ id: string; title: string } | undefined>(undefined);
/** 当前聊天运行时使用的有效会话 ID。 */
const activeSessionId = computed<string | null>(() => props.sessionId ?? createdSessionId.value);
/** 当前会话的待办列表 */
const currentSessionTodos = computed(() => todoStore.getTodos(activeSessionId.value ?? ''));

/**
 * 判断任务列表是否已经全部结束。
 * @param todos - 当前会话的任务列表
 * @returns 所有任务均完成或取消时返回 true
 */
function areTodosFinished(todos: TodoItem[]): boolean {
  return todos.length > 0 && todos.every((todo) => todo.status === 'completed' || todo.status === 'cancelled');
}

/**
 * 清理已结束任务并隐藏任务面板。
 * @param sessionId - 当前会话 ID
 */
function clearFinishedTodos(sessionId: string): void {
  todoStore.clearTodos(sessionId);
  todoPanelVisible.value = false;
  todoPanelDismissed.value = true;
}

/** LLM 调用 todowrite 时自动打开/关闭面板 */
watch(
  () => [activeSessionId.value, todoStore.getTodos(activeSessionId.value ?? '')] as const,
  ([sessionId, newTodos]) => {
    if (newTodos.length === 0) {
      todoPanelVisible.value = false;
      todoPanelDismissed.value = false;
    } else if (areTodosFinished(newTodos)) {
      if (sessionId) {
        clearFinishedTodos(sessionId);
      }
    } else if (!todoPanelVisible.value) {
      todoPanelVisible.value = true;
      todoPanelDismissed.value = false;
    } else {
      todoPanelDismissed.value = false;
    }
  },
  { deep: true, immediate: true }
);

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
/** 文件打开能力（供 open_resource 工具使用） */
const { openFileByPath } = useOpenFile();
/** 全局模型选择器引用。 */
const modelSelectRef = ref<InstanceType<typeof BModelSelect>>();
/** 全局模型选择器显示状态。 */
const modelSelectOpen = ref(false);
/** 对话视图引用 */
const conversationRef = ref<InstanceType<typeof ConversationView>>();

/** 聊天历史加载状态和方法 */
const { setLoadedMessages, fetchAllPriorHistory, messages, hasMoreHistory, loadHistory } = useChatHistory();

/** 确认控制器，管理工具调用的用户确认流程 */
const confirmationController = createChatConfirmationController();

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

/**
 * 当前语音实时转写在输入框中的占位范围。
 */
const activeVoiceInsertionRange = ref<{ start: number; end: number } | null>(null);

/** 插入文本到光标位置 */
function insertTextAtCursor(text: string): void {
  promptEditorRef.value?.insertTextAtCursor(text);
}

/**
 * 替换语音占位范围中的文本。
 * @param text - 新的占位文本
 */
function replaceVoiceInsertionText(text: string): void {
  const range = activeVoiceInsertionRange.value;
  const editor = promptEditorRef.value;

  if (!range || !editor) {
    return;
  }

  editor.replaceTextRange(range.start, range.end, text);
  activeVoiceInsertionRange.value = {
    start: range.start,
    end: range.start + text.length
  };
}

/**
 * 记录本次语音输入在编辑器中的插入起点。
 */
function handleVoiceStart(): void {
  const editor = promptEditorRef.value;
  if (!editor) {
    activeVoiceInsertionRange.value = null;
    return;
  }

  saveCursorPosition();
  const cursorPosition = editor.getCursorPosition();
  activeVoiceInsertionRange.value = {
    start: cursorPosition,
    end: cursorPosition
  };
}

/**
 * 处理语音实时转写增量文本。
 * @param payload - 增量转写文本
 */
function handleVoicePartial(payload: { text: string }): void {
  replaceVoiceInsertionText(payload.text);
}

/**
 * 使用最终转写文本插入到光标位置。
 * @param payload - 语音转写结果
 */
function handleVoiceComplete(payload: { text: string }): void {
  const hadActiveVoiceInsertion = Boolean(activeVoiceInsertionRange.value);

  if (!payload.text.trim()) {
    if (hadActiveVoiceInsertion) {
      replaceVoiceInsertionText('');
      activeVoiceInsertionRange.value = null;
    }
    interactionAPI.showToast({ content: '语音转写结果为空，请重试', type: 'error' });
    return;
  }

  if (hadActiveVoiceInsertion) {
    replaceVoiceInsertionText(payload.text);
    activeVoiceInsertionRange.value = null;
    return;
  }

  insertTextAtCursor(payload.text);
}

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

/** 聊天工具列表 */
const filesStore = useFilesStore();
const { openDraft } = useOpenDraft();

const { workspaceRoot, getWorkspaceRoot } = useWorkspaceRoot();

/** 最近文件列表，用于 @ 文件提及功能（实时响应 filesStore.recentFiles） */
const fileMentionOptions = computed<FileMentionOption[]>(() => {
  const files = filesStore.recentFiles ?? [];
  return files.map((file) => ({ id: file.id, name: file.name, path: file.path, ext: file.ext }));
});

const allBuiltinTools = createBuiltinTools({
  confirm: confirmationController.createAdapter(),
  skillStore,
  mcpStore: toolSettingsStore,
  getWorkspaceRoot,
  isFileInRecent: (filePath: string) => {
    return Boolean(filesStore.recentFiles?.some((file) => file.path === filePath));
  },
  /**
   * 通过文件绝对路径查找文件 ID。
   * 封装 filesStore.getFileByPath。
   */
  findFileByPath: async (filePath: string) => {
    const file = await filesStore.getFileByPath(filePath);
    return file ? { id: file.id } : null;
  },
  /**
   * 通过文件 ID 获取编辑器上下文。
   * 封装 editorToolContextRegistry.getContext。
   */
  getEditorContext: (documentId: string) => {
    return editorToolContextRegistry.getContext(documentId);
  },
  getDrawingContext: () => drawingToolContextRegistry.getCurrentContext(),
  getWebviewContext: () => webviewToolContextRegistry.getCurrentContext(),
  openDraft,
  /**
   * 通过文件路径打开文件标签页。
   * 封装 useOpenFile().openFileByPath，返回 { id } 或 null。
   */
  openFileByPath,
  /**
   * 在内置 webview 中打开 URL。
   * 通过 Vue Router 导航到 webview-web 页面。
   */
  openInWebview: (url: string) => {
    openWebview(new URL(url));
  },
  /**
   * 在系统浏览器中打开 URL。
   * 通过 Electron shell.openExternal 实现。
   */
  openExternal: (url: string) => {
    native.openExternal(url);
  },
  getPendingQuestion: () => {
    const pendingQuestion = userChoice.findPending(messages.value);
    if (!pendingQuestion) return null;

    return {
      questionId: pendingQuestion.questionId,
      toolCallId: pendingQuestion.toolCallId
    };
  },
  getSessionId: () => activeSessionId.value ?? undefined
});

/**
 * 动态获取当前可用的工具列表。
 * 每次调用时根据运行时状态（编辑器、MCP、Skill）过滤条件工具。
 * @returns 当前可用工具列表
 */
function getActiveTools(): AIToolExecutor[] {
  const hasActiveEditor = Boolean(editorToolContextRegistry.getCurrentContext());
  const hasActiveDrawing = Boolean(drawingToolContextRegistry.getCurrentContext());
  const hasActiveWebview = Boolean(webviewToolContextRegistry.getCurrentContext());
  const hasWorkspace = Boolean(workspaceRoot.value);

  // skillStore 在 onMounted 中异步初始化，allBuiltinTools 创建时 skillStore.initialized 为 false，
  // 因此需要在每次获取工具时动态判断是否需要追加 Skill 工具
  const dynamicTools: AIToolExecutor[] = [];
  if (skillStore.initialized && skillStore.getEnabledSkills().length > 0) {
    const hasSkillTool = allBuiltinTools.some((t) => t.definition.name === SKILL_TOOL_NAME);
    if (!hasSkillTool) {
      dynamicTools.push(createSkillTool(skillStore));
    }
  }

  return [...allBuiltinTools, ...dynamicTools].filter((tool) => {
    if (!isBuiltinToolName(tool.definition.name)) return false;
    if (tool.definition.name === 'read_current_document' && !hasActiveEditor) return false;
    if (tool.definition.name === APPLY_DRAWING_OPERATIONS_TOOL_NAME && !hasActiveDrawing) return false;
    if (tool.definition.name === READ_CURRENT_DRAWING_TOOL_NAME && !hasActiveDrawing) return false;
    if (tool.definition.name === UPDATE_CURRENT_DRAWING_TOOL_NAME && !hasActiveDrawing) return false;
    if (tool.definition.name === READ_CURRENT_WEBPAGE_TOOL_NAME && !hasActiveWebview) return false;
    if (tool.definition.name === READ_DIRECTORY_TOOL_NAME && !hasWorkspace) return false;
    return true;
  });
}

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
 * 处理聊天流中的确认卡片操作（已废弃，由底部弹窗接管）。
 */
function handleConfirmationAction(_confirmationId: string, action: ChatMessageConfirmationAction): void {
  handleConfirmationSheetAction(action);
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
 * 消息发送前的处理函数。
 * @param nextMessage - 待发送的消息
 * @returns 当前有效会话 ID
 */
async function handleBeforeSend(nextMessage: Message): Promise<string> {
  confirmationController.expirePendingConfirmation();

  const sessionId = await ensureActiveSession(nextMessage.content);

  await chatStore.addSessionMessage(sessionId, nextMessage);
  return sessionId;
}

/**
 * 判断消息是否为刚创建的空 assistant 草稿。
 * 空草稿需要立即持久化，确保硬中断时至少能恢复本轮生成状态。
 * @param message - 待检查消息
 * @returns 是否为空 assistant 草稿
 */
function isEmptyAssistantDraft(message: Message): boolean {
  return message.role === 'assistant' && message.loading === true && message.finished === false && !message.content && message.parts.length === 0;
}

/**
 * 将当前 assistant 草稿单条更新到数据库。
 * @param message - 当前 assistant 草稿消息
 */
async function persistAssistantDraft(message: Message): Promise<void> {
  const sessionId = activeSessionId.value;
  if (!sessionId) return;

  await chatStore.updateSessionMessage(sessionId, message);
}

/** 当前仍在执行的 assistant 草稿持久化任务。 */
let pendingAssistantDraftPersistence: Promise<void> = Promise.resolve();

/**
 * 串行执行 assistant 草稿持久化，避免旧草稿写入晚于最终消息落库。
 * @param message - 当前 assistant 草稿消息
 */
function queueAssistantDraftPersistence(message: Message): void {
  const persistenceTask = pendingAssistantDraftPersistence.catch(() => undefined).then(() => persistAssistantDraft(message));
  pendingAssistantDraftPersistence = persistenceTask.catch(() => undefined);
}

/**
 * 等待已启动的 assistant 草稿持久化完成。
 */
async function waitForAssistantDraftPersistence(): Promise<void> {
  await pendingAssistantDraftPersistence;
}

/** 节流后的 assistant 草稿持久化，避免 token 高频输出时频繁写库。 */
const persistAssistantDraftThrottled = throttle(
  (message: Message): void => {
    queueAssistantDraftPersistence(message);
  },
  ASSISTANT_DRAFT_PERSIST_INTERVAL_MS,
  { leading: false, trailing: true }
);

/**
 * 处理 assistant 草稿变化。
 * @param message - 当前 assistant 草稿消息
 */
function handleAssistantDraftChange(message: Message): void {
  if (isEmptyAssistantDraft(message)) {
    queueAssistantDraftPersistence(message);
    return;
  }

  persistAssistantDraftThrottled(message);
}

/**
 * 取消待执行的草稿持久化。
 * 最终消息落库会写入同一条记录，避免旧的 trailing 写入覆盖终态。
 */
function cancelAssistantDraftPersistence(): void {
  persistAssistantDraftThrottled.cancel();
}

/** 聊天流式处理 hook */
const { stream, loading: streamLoading } = useChatStream({
  messages,
  tools: getActiveTools,
  getToolContext: editorToolContextRegistry.getCurrentContext,
  getSessionId: () => activeSessionId.value ?? undefined,
  onBeforeRegenerate: handleBeforeRegenerate,
  onComplete: async (nextMessage: Message) => {
    cancelAssistantDraftPersistence();
    await waitForAssistantDraftPersistence();
    // eslint-disable-next-line no-use-before-define
    await handleComplete(nextMessage);
  },
  onAssistantDraftChange: handleAssistantDraftChange,
  onConfirmationAction: handleConfirmationAction
});

/** 统一任务运行时。 */
const taskRuntime = useChatTaskRuntime({
  abortChatTask: () => stream.abort?.()
});

/** 当前是否有活跃任务。 */
const loading = computed<boolean>(() => taskRuntime.loading.value || streamLoading.value);

/** 上下文窗口用量 hook（混合策略：空闲态用 API 上报值，流式中用估算器） */
const { usedTokens, snapshot: contextUsageSnapshot } = useContextUsage({ messages, contextWindow, selectedModel, streaming: loading });

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
 * 消息完成后的处理函数。
 * @param nextMessage - 完成的消息
 */
async function handleComplete(nextMessage: Message): Promise<void> {
  const sessionId = activeSessionId.value;
  const snapshot = captureSnapshot(nextMessage, sessionId);

  try {
    await chatStore.addSessionMessage(sessionId, nextMessage);
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
 * 处理消息编辑。
 * @param nextMessage - 要编辑的消息
 */
function handleChatEdit(nextMessage: Message): void {
  inputEvents.restoreFromMessage(nextMessage);
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

  const regenerated = await stream.regenerate(nextMessage);
  if (!regenerated) {
    taskRuntime.finishTask('chat');
  }
}

/**
 * 处理用户选择提交。
 * @param answer - 用户选择的答案数据
 */
async function handleChatUserChoiceSubmit(answer: AIUserChoiceAnswerData): Promise<void> {
  const startResult = taskRuntime.beginTask('chat');
  if (!startResult.ok) {
    return;
  }

  const submitted = await stream.submitUserChoice(answer);
  if (!submitted) {
    taskRuntime.finishTask('chat');
  }
}

/** 手动上下文压缩命令 hook。 */
const { handleAutoCompactContext, handleCompactContext } = useCompactContext({
  messages,
  getSessionId: () => activeSessionId.value ?? undefined,
  getContextWindow: () => contextWindow.value,
  beginCompactTask: (onAbort?: () => void) => taskRuntime.beginTask('compact', onAbort),
  finishCompactTask: () => taskRuntime.finishTask('compact'),
  persistMessage: (sessionId, nextMessage) => chatStore.addSessionMessage(sessionId, nextMessage),
  persistMessages: (sessionId, nextMessages) => chatStore.setSessionMessages(sessionId, nextMessages),
  scrollToBottom: () => conversationRef.value?.scrollToBottom({ behavior: 'auto' }),
  showToast: interactionAPI.showToast
});

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
 * 在发送用户消息前按上下文用量自动压缩旧消息。
 */
async function compactBeforeSendIfNeeded(): Promise<void> {
  if (!messages.value.length) {
    return;
  }

  if (!shouldAutoCompactByContextUsage(usedTokens.value, contextWindow.value)) {
    return;
  }

  await handleAutoCompactContext();
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
          onClick: () => router.push('/settings/service-model')
        },
        '去配置'
      )
    ]),
    type: 'error',
    duration: 6000
  });
}

/**
 * 提交用户文本消息并启动新一轮流式对话。
 * @param content - 用户输入内容
 * @param images - 可选图片列表
 * @param clearDraft - 是否清空当前主输入框草稿
 */
async function submitUserTextMessage(content: string, images: typeof inputImages.value = [], clearDraft = true): Promise<void> {
  const trimmedContent = content.trim();
  if (!trimmedContent && !images.length) return;

  await compactBeforeSendIfNeeded();

  const startResult = taskRuntime.beginTask('chat');
  if (!startResult.ok) {
    return;
  }

  try {
    const config = await stream.resolveServiceConfig();
    if (!config) {
      showNoModelConfigToast();
      taskRuntime.finishTask('chat');
      return;
    }

    const references = await buildMessageReferences(trimmedContent);

    const userMessage = create.userMessage(trimmedContent, references);
    if (images.length && supportsVision.value) {
      userMessage.files = [...images];
    }

    await handleBeforeSend(userMessage);
    messages.value.push(userMessage);
    conversationRef.value?.scrollToBottom({ behavior: 'auto' });
    focusInput();
    clearDraft && inputEvents.clear();

    await stream.streamMessages(messages.value, config);
  } catch (error) {
    taskRuntime.finishTask('chat');
    throw error;
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
 * 处理中止流式输出。
 * 等待助手消息持久化完成后再保存 interrupt 消息，确保数据库中消息顺序一致。
 */
async function handleAbort(): Promise<void> {
  confirmationController.expirePendingConfirmation();
  await taskRuntime.abortActiveTask();

  const sessionId = activeSessionId.value;
  if (sessionId) {
    const interruptMessage = create.interruptMessage();
    messages.value.push(interruptMessage);
    await chatStore.addSessionMessage(sessionId, interruptMessage);
  }
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

  await rollbackController.rollback(message);
}

/**
 * 处理模型变更（委托给 modelSelection hook）。
 * @param value - 新选中的模型标识
 */
function handleModelChange(model: { providerId: string; modelId: string }): void {
  modelSelectionEvents.onModelChange(model);
}

/**
 * 处理全局模型选择器变更。
 * 选择完成后聚焦输入框。
 * @param model - 新选中的模型标识
 */
function handleGlobalModelChange(model: { providerId: string; modelId: string }): void {
  handleModelChange(model);
  promptEditorRef.value?.focus();
}

/** 斜杠命令处理 hook */
const { handleSlashCommand } = useSlashCommands({
  openModelSelector: () => modelSelectRef.value?.open(),
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
  cancelAssistantDraftPersistence();
  taskRuntime.dispose();
  confirmationController.dispose();
});
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

/**
 * @file useChatWorkflow.ts
 * @description 编排 BChat Session actor、ChatRuntime IPC 与消息级交互流程。
 */
import type { UseChatSessionActorReturn } from './useChatSessionActor';
import type { PreparedRuntimeRequest, useRuntimeRequestConfig } from './useRuntimeRequestConfig';
import type { createChatConfirmationController } from '../utils/confirmationController';
import type { Message } from '../utils/types';
import type { AIServiceError, AIToolExecutor } from 'types/ai';
import type { ChatMessageFile } from 'types/chat';
import type { ChatRuntimeContextUsageSnapshot, ChatRuntimeStartResult, ChatRuntimeUserInputPart } from 'types/chat-runtime';
import type { ComputedRef, Ref } from 'vue';
import { computed, nextTick, watch } from 'vue';
import { cloneDeep } from 'lodash-es';
import type { ChatActorSystem } from '@/ai/chat/actorSystem';
import { findLastUserMessage } from '@/ai/chat/policies/memorySelection';
import { createRegenerationSlice } from '@/ai/chat/policies/regeneration';
import type { ChatSessionUIEvent } from '@/ai/chat/sessionEvents';
import { editorToolContextRegistry } from '@/ai/tools/context/editor';
import { getElectronAPI, unwrap } from '@/shared/platform/electron-api';
import { buildUserInputParts } from '../utils/filePartParser';
import { create, userChoice } from '../utils/messageHelper';
import { appendRuntimeErrorMessage } from '../utils/runtimeError';
import { useChatRuntime } from './useChatRuntime';
import { useChatSubmitter } from './useChatSubmitter';
import { useChatTaskRuntime } from './useChatTaskRuntime';
import { useRollback, type UseRollbackReturns } from './useRollback';
import { useRuntimeCompactContext } from './useRuntimeCompactContext';

/** Runtime 请求准备函数。 */
type PrepareRuntimeRequest = ReturnType<typeof useRuntimeRequestConfig>['prepareRuntimeRequest'];
/** Runtime 兼容请求配置函数。 */
type ResolveRuntimeRequestConfig = ReturnType<typeof useRuntimeRequestConfig>['resolveRuntimeRequestConfig'];
/** Chat 确认控制器。 */
type ChatConfirmationController = ReturnType<typeof createChatConfirmationController>;

/**
 * Chat Workflow hook 选项。
 */
interface UseChatWorkflowOptions {
  /** 当前消息列表 */
  messages: Ref<Message[]>;
  /** 当前会话 ID */
  activeSessionId: Ref<string | null>;
  /** 当前模型上下文窗口 */
  contextWindow: Ref<number>;
  /** 当前工作区根目录 */
  workspaceRoot: Ref<string>;
  /** 当前模型是否支持视觉 */
  supportsVision: Ref<boolean>;
  /** 应用级 Actor system */
  actorSystem: ChatActorSystem;
  /** 当前 Session actor API */
  sessionActor: UseChatSessionActorReturn;
  /** 当前可执行工具 */
  getActiveTools: () => AIToolExecutor[];
  /** 准备 Runtime 请求 */
  prepareRuntimeRequest: PrepareRuntimeRequest;
  /** 解析兼容 Runtime 请求配置 */
  resolveRuntimeRequestConfig: ResolveRuntimeRequestConfig;
  /** Runtime Bridge 请求处理器 */
  handleBridgeRequest: (event: Parameters<NonNullable<Parameters<typeof useChatRuntime>[0]['handleBridgeRequest']>>[0]) => Promise<unknown>;
  /** 工具确认控制器 */
  confirmationController: ChatConfirmationController;
  /** 确保存在可持久化会话 */
  ensureActiveSession: (title: string) => Promise<string>;
  /** 获取未加载的更早历史 */
  fetchAllPriorHistory: (sessionId: string) => Promise<Message[]>;
  /** 替换 renderer 当前消息 */
  setLoadedMessages: (messages: Message[]) => void;
  /** 持久化会话完整消息 */
  persistMessages: (sessionId: string, messages: Message[]) => Promise<void>;
  /** 更新单条会话消息 */
  updateSessionMessage: (sessionId: string | undefined, message: Message) => Promise<void>;
  /** 恢复输入草稿 */
  restoreInput: (message: Message) => void;
  /** 清空输入草稿 */
  clearInput: () => void;
  /** 聚焦输入编辑器 */
  focusInput: (options?: { moveToEnd?: boolean }) => void;
  /** 滚动消息到底部 */
  scrollToBottom: () => void;
  /** Runtime 完成后的页面级处理 */
  onRuntimeComplete: (message: Message) => Promise<void> | void;
  /** Runtime 上下文用量更新 */
  onContextUsageUpdated: (snapshot: ChatRuntimeContextUsageSnapshot) => void;
  /** 模型配置不存在 */
  onModelNotFound: () => void;
  /** 展示普通 Runtime 错误 */
  showRuntimeError: (message: string) => void;
  /** 恢复被回退消息关联的 Todo 快照 */
  restoreTodoSnapshots: (sessionId: string | null, messages: Message[]) => void;
}

/**
 * Chat Workflow hook 返回值。
 */
interface UseChatWorkflowReturn {
  /** 当前会话是否忙碌 */
  loading: ComputedRef<boolean>;
  /** 消息级统一提交器 */
  chatSubmitter: ReturnType<typeof useChatSubmitter>;
  /** 回退能力与可回退判断 */
  rollbackController: UseRollbackReturns;
  /** 手动压缩上下文 */
  handleCompactContext: () => Promise<void>;
  /** 重新生成指定消息 */
  handleRegenerate: (message: Message) => Promise<void>;
  /** 发送用户文本消息 */
  submitUserTextMessage: (content: string, images?: ChatMessageFile[], clearDraft?: boolean) => Promise<void>;
  /** 中止当前流程 */
  abort: () => Promise<void>;
  /** 取消当前流程 */
  cancel: () => Promise<void>;
  /** 回退到指定消息 */
  rollback: (message: Message) => Promise<void>;
  /** 释放 renderer 侧任务资源 */
  dispose: () => void;
  /** 处理应用级总线重放的 Session UI 事件 */
  handleSessionUIEvent: (event: ChatSessionUIEvent) => Promise<void>;
}

/**
 * 发送到 ChatRuntime 的用户消息输入。
 */
interface RuntimeUserMessageSendInput {
  /** 已创建的用户消息 */
  userMessage: Message;
  /** 结构化输入片段 */
  parts: ChatRuntimeUserInputPart[];
  /** 是否清空草稿 */
  clearDraft?: boolean;
}

/**
 * 创建当前 BChat 会话的 Runtime 工作流。
 * @param options - Actor、IPC 与页面回调依赖
 * @returns 可直接绑定到页面事件的工作流 API
 */
export function useChatWorkflow(options: UseChatWorkflowOptions): UseChatWorkflowReturn {
  let abortRuntimeChatTask: (() => Promise<void>) | null = null;
  const rollbackIgnoredRuntimeIds = new Set<string>();
  const taskRuntime = useChatTaskRuntime({
    abortChatTask: async (): Promise<void> => {
      await abortRuntimeChatTask?.();
    }
  });
  const loading = computed<boolean>(() => taskRuntime.loading.value || options.sessionActor.loading.value);

  watch(options.activeSessionId, (): void => {
    // renderer 任务锁只属于当前可见会话，后台运行状态由对应 Session actor 保留。
    taskRuntime.resetToIdle();
  });

  /** 判断 Runtime 事件是否已被回退流程作废。 */
  function isRuntimeEventIgnored(runtimeId: string): boolean {
    return rollbackIgnoredRuntimeIds.has(runtimeId);
  }

  /** 注册 Runtime 路由与冻结 capability 快照。 */
  function registerManagedRuntime(result: ChatRuntimeStartResult, prepared: PreparedRuntimeRequest): void {
    options.sessionActor.markPrepared();
    if (result.completed === true) {
      options.sessionActor.markCompleted();
      return;
    }

    const sessionId = options.activeSessionId.value;
    const turnRef = options.sessionActor.sessionRef.value?.getSnapshot().context.turnRef;
    const turnId = turnRef?.getSnapshot().context.turnId;
    if (!sessionId || !turnId) {
      throw new Error('Chat Session Actor is missing the active Turn');
    }

    const documentId = editorToolContextRegistry.getCurrentContext()?.document.id;
    options.actorSystem.registerRuntime(
      { sessionId, turnId, agentId: 'primary', runtimeId: result.runtimeId },
      {
        tools: prepared.rendererTools,
        documentId,
        getToolContext: () => (documentId ? editorToolContextRegistry.getContext(documentId) : undefined),
        handleBridgeRequest: options.handleBridgeRequest
      }
    );
    options.actorSystem.send({
      type: 'runtime.event',
      runtimeId: result.runtimeId,
      event: { type: 'runtime.started', runtimeId: result.runtimeId }
    });
  }

  /** 处理 Runtime 完成并结束兼容任务锁。 */
  async function handleRuntimeComplete(nextMessage: Message): Promise<void> {
    options.sessionActor.markCompleted();
    if (nextMessage.runtimeId) {
      options.actorSystem.unregisterRuntime(nextMessage.runtimeId);
    }
    try {
      await options.onRuntimeComplete(nextMessage);
    } finally {
      taskRuntime.finishTask('chat');
    }
  }

  /** 处理 Runtime 错误并写入持久化错误消息。 */
  async function handleRuntimeError(error: AIServiceError): Promise<void> {
    options.sessionActor.markFailed({ code: 'runtime_failed', message: error.message, cause: error });
    const activeRuntimeId = options.sessionActor.activeRuntimeId.value;
    if (activeRuntimeId) {
      options.actorSystem.unregisterRuntime(activeRuntimeId);
    }
    taskRuntime.finishTask('chat');
    if (error.code === 'MODEL_NOT_FOUND') {
      options.onModelNotFound();
      return;
    }

    const sessionId = options.activeSessionId.value;
    if (!sessionId) {
      options.showRuntimeError(error.message);
      return;
    }
    await appendRuntimeErrorMessage({
      sessionId,
      content: error.message,
      visibleMessages: options.messages.value,
      fetchAllPriorHistory: options.fetchAllPriorHistory,
      persistMessages: options.persistMessages,
      setLoadedMessages: options.setLoadedMessages,
      afterMessagesUpdated: async (): Promise<void> => {
        await nextTick();
        options.scrollToBottom();
      }
    });
  }

  /** 将已解决交互同步回 Agent、Turn 与 Session。 */
  function markInteractionResolved(runtimeId: string, sessionId: string, confirmationId: string): void {
    options.actorSystem.send({
      type: 'runtime.event',
      runtimeId,
      event: { type: 'runtime.interactionResolved', runtimeId }
    });
    options.actorSystem.sendToSession(sessionId, { type: 'session.interactionResolved' });
    options.actorSystem.clearSessionPendingInteraction(sessionId, confirmationId);
  }

  const chatRuntime = useChatRuntime({
    messages: options.messages,
    getSessionId: (): string | undefined => options.activeSessionId.value ?? undefined,
    tools: options.getActiveTools,
    getToolContext: editorToolContextRegistry.getCurrentContext,
    isRuntimeEventIgnored,
    requestConfirmation: options.confirmationController.requestConfirmation,
    onConfirmationResolved: (event): void => markInteractionResolved(event.runtimeId, event.sessionId, event.confirmationId),
    handleBridgeRequest: options.handleBridgeRequest,
    shouldDeferRendererRequest: (event): boolean =>
      event.sessionId !== options.activeSessionId.value && options.actorSystem.actor.getSnapshot().context.runtimeRoutes.has(event.runtimeId),
    onComplete: handleRuntimeComplete,
    onContextUsageUpdated: options.onContextUsageUpdated,
    onError: handleRuntimeError
  });
  abortRuntimeChatTask = (): Promise<void> => chatRuntime.abort(options.sessionActor.activeRuntimeId.value);

  /** 持久化重新生成前的消息截断。 */
  async function handleBeforeRegenerate(nextMessages: Message[]): Promise<void> {
    options.confirmationController.expirePendingConfirmation();
    const sessionId = options.activeSessionId.value;
    if (!sessionId) return;
    const historyMessages = await options.fetchAllPriorHistory(sessionId);
    await options.persistMessages(sessionId, [...historyMessages, ...nextMessages]);
  }

  /** 启动指定 assistant 消息的重新生成。 */
  async function startRuntimeRegenerate(targetMessage: Message): Promise<boolean> {
    const regenerationSlice = createRegenerationSlice(options.messages.value, targetMessage.id);
    if (!regenerationSlice || !options.activeSessionId.value) return false;

    const { sourceMessages, removedMessages } = regenerationSlice;
    options.messages.value.splice(0, options.messages.value.length, ...sourceMessages);
    const prepared = await options.prepareRuntimeRequest(findLastUserMessage(sourceMessages));
    if (!prepared) {
      options.messages.value.splice(0, options.messages.value.length, ...sourceMessages, ...removedMessages);
      return false;
    }

    options.sessionActor.regenerate(targetMessage.id);
    try {
      await handleBeforeRegenerate(sourceMessages);
      const result = await chatRuntime.continueTurn({
        sessionId: options.activeSessionId.value,
        messages: sourceMessages,
        ...prepared.config
      });
      registerManagedRuntime(result, prepared);
    } catch (error: unknown) {
      options.sessionActor.markPreparationFailed({
        code: 'runtime_start_failed',
        message: error instanceof Error ? error.message : '重新生成失败',
        cause: error
      });
      throw error;
    }
    return true;
  }

  /** 处理消息重新生成。 */
  async function handleRegenerate(nextMessage: Message): Promise<void> {
    const startResult = taskRuntime.beginTask('chat');
    if (!startResult.ok) return;
    try {
      if (!(await startRuntimeRegenerate(nextMessage))) {
        taskRuntime.finishTask('chat');
      }
    } catch (error: unknown) {
      taskRuntime.finishTask('chat');
      throw error;
    }
  }

  /** 发送已构造的用户消息。 */
  async function sendRuntimeUserMessage(input: RuntimeUserMessageSendInput): Promise<void> {
    let pendingSessionId: string | null = null;
    let pendingUserMessage: Message | null = null;
    try {
      const prepared = await options.prepareRuntimeRequest(input.userMessage, input.parts);
      if (!prepared) {
        taskRuntime.finishTask('chat');
        return;
      }

      const sessionId = await options.ensureActiveSession(input.userMessage.content);
      pendingSessionId = sessionId;
      pendingUserMessage = input.userMessage;
      options.sessionActor.submit({
        messageId: input.userMessage.id,
        createdAt: input.userMessage.createdAt,
        content: input.userMessage.content,
        parts: input.parts,
        files: input.userMessage.files
      });
      options.confirmationController.expirePendingConfirmation();
      options.focusInput();
      if (input.clearDraft === true) options.clearInput();
      options.scrollToBottom();

      const result = await chatRuntime.send({
        sessionId,
        content: input.userMessage.content,
        parts: input.parts,
        files: input.userMessage.files,
        userMessageId: input.userMessage.id,
        userMessageCreatedAt: input.userMessage.createdAt,
        ...prepared.config
      });
      registerManagedRuntime(result, prepared);
    } catch (error: unknown) {
      options.sessionActor.markPreparationFailed({
        code: 'runtime_start_failed',
        message: error instanceof Error ? error.message : '发送消息失败',
        cause: error
      });
      taskRuntime.finishTask('chat');
      const errorMessage = error instanceof Error ? error.message : '发送消息失败';
      if (pendingSessionId && pendingUserMessage) {
        await appendRuntimeErrorMessage({
          sessionId: pendingSessionId,
          content: errorMessage,
          visibleMessages: options.messages.value,
          precedingMessage: pendingUserMessage,
          fetchAllPriorHistory: options.fetchAllPriorHistory,
          persistMessages: options.persistMessages,
          setLoadedMessages: options.setLoadedMessages,
          afterMessagesUpdated: async (): Promise<void> => {
            await nextTick();
            options.scrollToBottom();
          }
        });
        return;
      }
      options.showRuntimeError(errorMessage);
    }
  }

  const chatSubmitter = useChatSubmitter({
    taskRuntime,
    messages: options.messages,
    getSessionId: (): string | undefined => options.activeSessionId.value ?? undefined,
    getActiveRuntimeId: (): string | undefined => options.sessionActor.activeRuntimeId.value,
    resolveRuntimeRequestConfig: options.resolveRuntimeRequestConfig,
    prepareRuntimeRequest: (): ReturnType<PrepareRuntimeRequest> => options.prepareRuntimeRequest(),
    onContinueStarted: options.sessionActor.continueWithAnswer,
    onRuntimeStarted: registerManagedRuntime,
    onContinueFailed: (error: unknown): void => {
      options.sessionActor.markPreparationFailed({
        code: 'runtime_start_failed',
        message: error instanceof Error ? error.message : '继续生成失败',
        cause: error
      });
    },
    submitUserChoice: chatRuntime.submitUserChoice,
    sendRuntimeUserMessage,
    submitRuntimeMessagePart: chatRuntime.submitMessagePart,
    updateSessionMessage: options.updateSessionMessage
  });

  const rollbackController = useRollback({
    messages: options.messages,
    getSessionId: (): string | undefined => options.activeSessionId.value ?? undefined,
    fetchAllPriorHistory: options.fetchAllPriorHistory,
    persistMessages: options.persistMessages,
    invalidateCompressionRecords: async (recordIds: string[]): Promise<void> => {
      for (const recordId of recordIds) {
        // eslint-disable-next-line no-await-in-loop
        unwrap(await getElectronAPI().chatCompressionUpdateStatus(recordId, 'invalid', 'rollback_truncation'));
      }
    },
    restoreInput: options.restoreInput,
    expireConfirmation: options.confirmationController.expirePendingConfirmation,
    focusInput: options.focusInput
  });

  const { handleCompactContext } = useRuntimeCompactContext({
    messages: options.messages,
    getSessionId: (): string | undefined => options.activeSessionId.value ?? undefined,
    getContextWindow: (): number => options.contextWindow.value,
    beginCompactTask: (onAbort) => {
      const result = taskRuntime.beginTask('compact', onAbort);
      if (result.ok) options.sessionActor.compact();
      return result;
    },
    finishCompactTask: (): void => taskRuntime.finishTask('compact'),
    onCompactFinished: options.sessionActor.markCompactFinished,
    scrollToBottom: options.scrollToBottom,
    isRuntimeEventIgnored
  });

  /** 发送一条新的用户文本消息。 */
  async function submitUserTextMessage(content: string, images: ChatMessageFile[] = [], clearDraft = true): Promise<void> {
    const trimmedContent = content.trim();
    if (!trimmedContent && !images.length) return;
    const startResult = taskRuntime.beginTask('chat');
    if (!startResult.ok) return;

    const userMessage = create.userMessage(trimmedContent);
    if (images.length && options.supportsVision.value) userMessage.files = [...images];
    await sendRuntimeUserMessage({
      userMessage,
      parts: buildUserInputParts(trimmedContent, options.workspaceRoot.value || undefined),
      clearDraft
    });
  }

  /** 取消等待用户选择的持久化消息。 */
  async function abortPendingUserChoiceIfNeeded(): Promise<boolean> {
    const sessionId = options.activeSessionId.value;
    if (!sessionId) return false;
    const nextMessages = cloneDeep(options.messages.value);
    const cancelledAssistantMessage = userChoice.cancelPending(nextMessages);
    if (!cancelledAssistantMessage) return false;

    const visibleMessages = [...nextMessages, create.interruptMessage(cancelledAssistantMessage)];
    const historyMessages = await options.fetchAllPriorHistory(sessionId);
    await options.persistMessages(sessionId, [...historyMessages, ...visibleMessages]);
    options.setLoadedMessages(visibleMessages);
    await nextTick();
    options.scrollToBottom();
    return true;
  }

  /** 判断 renderer hook 当前记录的 Runtime 是否属于可见会话。 */
  function hasCurrentSessionRendererRuntime(): boolean {
    const runtimeId = chatRuntime.activeRuntimeId.value;
    if (!runtimeId) return false;
    const address = options.actorSystem.actor.getSnapshot().context.runtimeRoutes.get(runtimeId);
    return !address || address.sessionId === options.activeSessionId.value;
  }

  /** 中止当前 Chat 或 Compact Runtime。 */
  async function abort(): Promise<void> {
    options.confirmationController.expirePendingConfirmation();
    const runtimeId = options.sessionActor.activeRuntimeId.value;
    options.sessionActor.cancel();
    try {
      if (taskRuntime.activeTask.value !== 'compact' && !hasCurrentSessionRendererRuntime() && (await abortPendingUserChoiceIfNeeded())) {
        taskRuntime.finishTask('chat');
        options.sessionActor.markRuntimeCancelled();
        return;
      }
      await taskRuntime.abortActiveTask();
      options.sessionActor.markRuntimeCancelled();
      if (runtimeId) options.actorSystem.unregisterRuntime(runtimeId);
    } catch (error: unknown) {
      options.sessionActor.markCancelFailed({
        code: 'cancel_failed',
        message: error instanceof Error ? error.message : '取消生成失败',
        cause: error
      });
      throw error;
    }
  }

  /** 仅在工作流忙碌时执行取消。 */
  async function cancel(): Promise<void> {
    if (loading.value) await abort();
  }

  /** 回退消息并同步 Session machine 结果。 */
  async function rollback(message: Message): Promise<void> {
    const index = options.messages.value.findIndex((item: Message): boolean => item.id === message.id);
    if (index === -1) return;
    const shouldAbortActiveTask = loading.value;
    options.sessionActor.rollback(message.id);
    if (shouldAbortActiveTask) await abort();

    const rolledBackMessages = options.messages.value.slice(index);
    for (const rolledBackMessage of rolledBackMessages) {
      if (rolledBackMessage.runtimeId) {
        rollbackIgnoredRuntimeIds.add(rolledBackMessage.runtimeId);
        options.actorSystem.unregisterRuntime(rolledBackMessage.runtimeId);
      }
    }
    try {
      await rollbackController.rollback(message);
      options.restoreTodoSnapshots(options.activeSessionId.value, rolledBackMessages);
      options.sessionActor.markRollbackCompleted();
    } catch (error: unknown) {
      options.sessionActor.markRollbackFailed({
        code: 'rollback_failed',
        message: error instanceof Error ? error.message : '回退消息失败',
        cause: error
      });
      throw error;
    }
  }

  /** 处理切回会话时重放的待确认交互。 */
  async function handleSessionUIEvent(event: ChatSessionUIEvent): Promise<void> {
    if (event.type !== 'confirmationRequested') return;
    const decision = await options.confirmationController.requestConfirmation(event.event.request);
    const result = await getElectronAPI().chatRuntimeSubmitConfirmation({
      runtimeId: event.event.runtimeId,
      confirmationId: event.event.confirmationId,
      decision
    });
    if (!result.ok) {
      throw new Error(result.error ?? '提交确认结果失败');
    }
    markInteractionResolved(event.event.runtimeId, event.event.sessionId, event.event.confirmationId);
  }

  /** 释放兼容任务运行时。 */
  function dispose(): void {
    taskRuntime.dispose();
  }

  return {
    loading,
    chatSubmitter,
    rollbackController,
    handleCompactContext,
    handleRegenerate,
    submitUserTextMessage,
    abort,
    cancel,
    rollback,
    dispose,
    handleSessionUIEvent
  };
}

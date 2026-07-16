/**
 * @file service.mts
 * @description 主进程 ChatRuntime 服务骨架。
 */
import type {
  ActiveChatRuntime,
  ChatRuntimeMainToolExecutionInput,
  ChatRuntimeMessageReader,
  ChatRuntimeMessageKind,
  ChatRuntimeMessageWriter,
  ChatRuntimeRendererToolExecutionInput,
  ChatRuntimeServiceDependencies,
  ChatRuntimeStreamAborter,
  ChatRuntimeStreamExecutor
} from './types.mjs';
import type { AIServiceError, AIToolExecutionResult, AIUsage } from 'types/ai';
import type { ChatMessageRecord, ChatPendingInteraction } from 'types/chat';
import type {
  ChatRuntimeAbortInput,
  ChatRuntimeAutoNameInput,
  ChatRuntimeAutoNameResult,
  ChatRuntimeBridgeResponseInput,
  ChatRuntimeBridgeResult,
  ChatRuntimeConfirmationDecision,
  ChatRuntimeCompletionReason,
  ChatRuntimeContinueInput,
  ChatRuntimeRecoverySnapshot,
  ChatRuntimeSendInput,
  ChatRuntimeStartResult,
  ChatRuntimeSubmitConfirmationInput,
  ChatRuntimeSubmitMessagePartInput,
  ChatRuntimeSubmitUserChoiceInput,
  ChatRuntimeSubmitToolResultInput
} from 'types/chat-runtime';
import { BrowserWindow } from 'electron';
import { nanoid } from 'nanoid';
import { AI_ERROR_CODE, createAIServiceError, isAIServiceError } from '../../ai/errors/codes.mjs';
import { aiService } from '../../ai/service.mjs';
import { chatSessionManager } from '../service.mjs';
import { invalidateStaleSkillToolResults } from './context/model-message.mjs';
import { findToolOutputPruneProtectedStartIndex, pruneMessageToolOutputs } from './context/tool-output-prune.mjs';
import { addRuntimeUsage, isSameRuntimeUsage } from './context/usage.mjs';
import { createRuntimeBridgeRequests, type RuntimeBridgeRequestInput } from './controllers/bridge.mjs';
import { createRuntimeConfirmationRequests, type RuntimeConfirmationRequestInput } from './controllers/confirmation.mjs';
import { createRuntimeRendererToolRequests } from './controllers/renderer-tool.mjs';
import { ChatRuntimeError } from './errors.mjs';
import { createRuntimeLockRegistry } from './infrastructure/locks.mjs';
import { findLastRuntimeAssistantMessage, findLastRuntimeUserMessage, normalizeContinuationMessages } from './messages/continuation.mjs';
import { createRuntimeAssistantPlaceholder, createRuntimeInterruptMessage, createRuntimeUserMessage } from './messages/factory.mjs';
import { materializeRuntimeFileParts } from './messages/file-parts.mjs';
import {
  ensureRuntimeMessageCreatedAt,
  finishAssistantMessageInterrupted,
  hasAssistantResponseContent,
  markAssistantMessageFailed
} from './messages/finalizer.mjs';
import { applyUserChoiceAnswer, cloneRuntimeMessage } from './messages/user-choice.mjs';
import { createAutoNamePrompt, normalizeAutoNameTitle } from './model/auto-name.mjs';
import { createDefaultChatModelResolver } from './model/resolver.mjs';
import { createContinuationRuntime, createSendRuntime, createUserChoiceRuntime } from './runners/factory.mjs';
import { createRuntimeStreamExecutor } from './stream/index.mjs';
import { createMainToolExecutor } from './tools/index.mjs';

/** 单个 runtime 内工具续轮最大次数。 */
const MAX_RUNTIME_CONTINUATION_ROUNDS = 25;

/** Renderer 请求默认超时时间。 */
const RUNTIME_RENDERER_REQUEST_TIMEOUT_MS = 30_000;

export { ChatRuntimeError } from './errors.mjs';

/**
 * 创建默认 Electron runtime 事件发送器。
 * @returns runtime 事件发送器
 */
function createDefaultEmitter(): ChatRuntimeServiceDependencies['emit'] {
  return (name, payload): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(name, payload);
    }
  };
}

/**
 * 创建默认 runtime 消息写入器。
 * @returns runtime 消息写入器
 */
function createDefaultMessageWriter(): ChatRuntimeMessageWriter {
  return {
    addMessage(message: ChatMessageRecord): void {
      chatSessionManager.addMessage(message);
    },

    updateMessage(message: ChatMessageRecord): void {
      chatSessionManager.updateMessage(message);
    },

    deleteMessage(sessionId: string, messageId: string): void {
      chatSessionManager.deleteMessage(sessionId, messageId);
    }
  };
}

/**
 * 创建默认 runtime 消息读取器。
 * @returns runtime 消息读取器
 */
function createDefaultMessageReader(): ChatRuntimeMessageReader {
  return {
    getMessages(sessionId: string): ChatMessageRecord[] {
      return chatSessionManager.getMessages(sessionId);
    }
  };
}

/**
 * 创建默认 runtime 流式执行器。
 * @returns runtime 流式执行器
 */
function createDefaultStreamExecutor(
  executeRendererTool?: (input: ChatRuntimeRendererToolExecutionInput) => Promise<AIToolExecutionResult>,
  executeMainTool?: (input: ChatRuntimeMainToolExecutionInput) => Promise<AIToolExecutionResult>,
  rendererToolTimeoutMs?: number
): ChatRuntimeStreamExecutor {
  const resolver = createDefaultChatModelResolver();
  return createRuntimeStreamExecutor({
    resolver,
    streamText: (createOptions, request) => aiService.streamText(createOptions, request),
    executeRendererTool,
    executeMainTool,
    rendererToolTimeoutMs
  });
}

/**
 * 创建默认 runtime 流式中止函数。
 * @returns runtime 流式中止函数
 */
function createDefaultStreamAborter(): ChatRuntimeStreamAborter {
  return (runtimeId: string): void => {
    aiService.abortStream(runtimeId);
  };
}

/**
 * 创建默认 runtime 消息 ID。
 * @param kind - 消息类型
 * @returns 消息 ID
 */
function createDefaultMessageId(kind: ChatRuntimeMessageKind): string {
  return `${kind}-${nanoid()}`;
}

/**
 * 将 runtime 流式异常规范化为 AI 服务错误。
 * @param error - 原始异常
 * @returns AI 服务错误
 */
function normalizeRuntimeStreamError(error: unknown): AIServiceError {
  if (isAIServiceError(error)) return error;
  if (error instanceof Error) return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, error.message);

  return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, 'ChatRuntime stream failed');
}

/**
 * 创建 ChatRuntime 服务。
 * @param dependencies - runtime 依赖项
 * @returns ChatRuntime 服务
 */
export function createChatRuntimeService(dependencies: Partial<ChatRuntimeServiceDependencies> = {}) {
  const emit = dependencies.emit ?? createDefaultEmitter();
  const messageWriter = dependencies.messageWriter ?? createDefaultMessageWriter();
  const messageReader = dependencies.messageReader ?? createDefaultMessageReader();
  const materializeFileParts = dependencies.materializeFileParts ?? materializeRuntimeFileParts;
  const streamAbort = dependencies.streamAbort ?? createDefaultStreamAborter();
  const createMessageId = dependencies.createMessageId ?? createDefaultMessageId;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const autoNameResolver = dependencies.autoNameResolveModel ?? (() => createDefaultChatModelResolver().resolve());
  const autoNameGenerateText = dependencies.autoNameGenerateText ?? ((createOptions, request) => aiService.generateText(createOptions, request));
  const autoNameUpdateSessionTitle = dependencies.autoNameUpdateSessionTitle ?? ((sessionId, title) => chatSessionManager.updateSessionTitle(sessionId, title));
  const { rendererToolTimeoutMs } = dependencies;
  const locks = createRuntimeLockRegistry();
  const activeRuntimes = new Map<string, ActiveChatRuntime>();
  const activeAssistantMessages = new Map<string, ChatMessageRecord>();
  const getRuntime = (runtimeId: string): ActiveChatRuntime | undefined => activeRuntimes.get(runtimeId);
  const confirmationRequests = createRuntimeConfirmationRequests({ emit, getRuntime });
  const bridgeRequests = createRuntimeBridgeRequests({
    emit,
    getRuntime,
    timeoutMs: RUNTIME_RENDERER_REQUEST_TIMEOUT_MS
  });
  const rendererToolRequests = createRuntimeRendererToolRequests({
    emit,
    getRuntime,
    timeoutMs: RUNTIME_RENDERER_REQUEST_TIMEOUT_MS
  });

  const executeMainTool = createMainToolExecutor({
    now,
    requestBridge: bridgeRequests.request,
    requestConfirmation: confirmationRequests.request
  });

  const streamExecutor = dependencies.streamExecutor ?? createDefaultStreamExecutor(rendererToolRequests.request, executeMainTool, rendererToolTimeoutMs);

  /**
   * 拒绝 renderer 重复分配仍在使用的 Runtime ID。
   * @param runtimeId - renderer 分配的 Runtime ID
   */
  function assertRuntimeIdAvailable(runtimeId: string): void {
    if (activeRuntimes.has(runtimeId)) {
      throw new ChatRuntimeError('RUNTIME_ALREADY_ACTIVE', `Runtime ${runtimeId} is already active`);
    }
  }

  /**
   * 判断 assistant 是否正暂停等待用户输入。
   * @param message - assistant 消息
   * @returns 是否存在等待用户输入的工具结果
   */
  function isAssistantAwaitingUserInput(message: ChatMessageRecord): boolean {
    return message.parts.some((part) => part.type === 'tool' && part.result?.status === 'awaiting_user_input');
  }

  /**
   * 将等待用户输入的消息转换为可恢复交互。
   * @param runtime - 产生交互的 Runtime
   * @param message - 等待用户输入的 assistant 消息
   * @returns 可恢复交互，不存在等待片段时返回 null
   */
  function createPendingInteraction(runtime: ActiveChatRuntime, message: ChatMessageRecord): ChatPendingInteraction | null {
    const part = message.parts.find((messagePart) => messagePart.type === 'tool' && messagePart.result?.status === 'awaiting_user_input');
    if (!part || part.type !== 'tool' || part.result?.status !== 'awaiting_user_input') return null;
    return {
      type: 'userChoice',
      status: 'pending',
      sessionId: runtime.sessionId,
      messageId: message.id,
      runtimeId: runtime.runtimeId,
      agentId: runtime.agentId,
      toolCallId: part.toolCallId,
      questionId: part.result.data.questionId
    };
  }

  /**
   * 完成 runtime 并释放 session 写入锁。
   * @param runtime - 需要完成的 runtime
   * @param usage - Provider 返回的 usage
   * @param reason - Runtime 成功完成或暂停等待用户
   */
  function completeRuntime(runtime: ActiveChatRuntime, usage?: AIUsage, reason: ChatRuntimeCompletionReason = 'completed'): void {
    const assistantMessage = activeAssistantMessages.get(runtime.runtimeId);
    runtime.status = 'completed';
    activeRuntimes.delete(runtime.runtimeId);
    activeAssistantMessages.delete(runtime.runtimeId);
    rendererToolRequests.rejectRuntime(runtime.runtimeId, 'Runtime completed');
    confirmationRequests.rejectRuntime(runtime.runtimeId, 'Runtime completed');
    bridgeRequests.rejectRuntime(runtime.runtimeId, 'Runtime completed');
    locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
    if (reason === 'awaiting_user_input' && assistantMessage) {
      emit('chat:runtime:message-updated', {
        runtimeId: runtime.runtimeId,
        sessionId: runtime.sessionId,
        clientId: runtime.clientId,
        agentId: runtime.agentId,
        parentRuntimeId: runtime.parentRuntimeId,
        message: assistantMessage
      });
    }
    const completeEventBase = {
      runtimeId: runtime.runtimeId,
      sessionId: runtime.sessionId,
      clientId: runtime.clientId,
      agentId: runtime.agentId,
      parentRuntimeId: runtime.parentRuntimeId,
      usage
    };
    const interaction = assistantMessage ? createPendingInteraction(runtime, assistantMessage) : null;
    if (reason === 'awaiting_user_input' && interaction) {
      emit('chat:runtime:complete', { ...completeEventBase, reason, interaction });
      return;
    }
    emit('chat:runtime:complete', { ...completeEventBase, reason: 'completed' });
  }

  /**
   * 更新 assistant 草稿并发送 runtime 事件。
   * @param runtime - runtime 状态
   * @param message - assistant 草稿消息
   */
  async function updateAssistantMessage(runtime: ActiveChatRuntime, message: ChatMessageRecord): Promise<void> {
    if (!activeRuntimes.has(runtime.runtimeId)) return;

    await messageWriter.updateMessage(message);
    // 等待用户的消息只能在 completeRuntime 释放会话写锁后对 renderer 可见。
    if (message.loading === true && message.finished === false && isAssistantAwaitingUserInput(message)) return;
    emit('chat:runtime:message-updated', {
      runtimeId: runtime.runtimeId,
      sessionId: runtime.sessionId,
      clientId: runtime.clientId,
      agentId: runtime.agentId,
      parentRuntimeId: runtime.parentRuntimeId,
      message
    });
  }

  /**
   * 删除空 assistant 占位并广播删除事件。
   * @param runtime - runtime 状态
   * @param assistantMessage - assistant 占位消息
   */
  async function deleteAssistantMessage(runtime: ActiveChatRuntime, assistantMessage: ChatMessageRecord): Promise<void> {
    await messageWriter.deleteMessage?.(assistantMessage.sessionId, assistantMessage.id);
    emit('chat:runtime:message-deleted', {
      runtimeId: runtime.runtimeId,
      sessionId: runtime.sessionId,
      clientId: runtime.clientId,
      agentId: runtime.agentId,
      parentRuntimeId: runtime.parentRuntimeId,
      messageId: assistantMessage.id
    });
  }

  /**
   * 成功 turn 后剪枝旧的大型 tool output。
   * @param runtime - runtime 状态
   * @param sourceMessages - 当前源消息
   * @param assistantMessage - 当前 assistant 终态消息
   */
  async function pruneOldToolOutputsIfNeeded(
    runtime: ActiveChatRuntime,
    sourceMessages: ChatMessageRecord[],
    assistantMessage: ChatMessageRecord
  ): Promise<void> {
    const completedMessages = [...sourceMessages.filter((message) => message.id !== assistantMessage.id), assistantMessage];
    const protectedStartIndex = findToolOutputPruneProtectedStartIndex(completedMessages);
    const prunableMessages = completedMessages.slice(0, protectedStartIndex);

    for (const message of prunableMessages) {
      const prunedMessage = pruneMessageToolOutputs(message);
      if (!prunedMessage) continue;

      // eslint-disable-next-line no-await-in-loop
      await updateAssistantMessage(runtime, prunedMessage);
    }
  }

  /**
   * 在所有模型续轮结束后维持等待态或兜底标记 assistant 消息完成。
   * @param runtime - runtime 状态
   * @param assistantMessage - assistant 草稿消息
   * @param usage - 汇总后的 provider usage
   */
  async function finishAssistantMessageIfNeeded(runtime: ActiveChatRuntime, assistantMessage: ChatMessageRecord, usage: AIUsage | undefined): Promise<void> {
    if (isAssistantAwaitingUserInput(assistantMessage)) {
      if (assistantMessage.loading === true && assistantMessage.finished === false) return;
      assistantMessage.loading = true;
      assistantMessage.finished = false;
      await updateAssistantMessage(runtime, assistantMessage);
      return;
    }
    if (assistantMessage.finished === true) return;

    assistantMessage.loading = false;
    assistantMessage.finished = true;
    if (usage) {
      assistantMessage.usage = usage;
    }
    await updateAssistantMessage(runtime, assistantMessage);
  }

  /**
   * 读取当前 runtime 可发送给模型的源消息。
   * @param runtime - runtime 状态
   * @param userMessage - 当前用户消息
   * @param assistantMessage - 当前 assistant 草稿消息
   * @returns 源消息列表
   */
  async function readRuntimeSourceMessages(
    runtime: ActiveChatRuntime,
    userMessage: ChatMessageRecord,
    assistantMessage: ChatMessageRecord
  ): Promise<ChatMessageRecord[]> {
    const persistedMessages = await messageReader.getMessages(runtime.sessionId);
    const messagesWithoutDraft = persistedMessages.filter((message) => message.id !== assistantMessage.id);
    const hasCurrentUserMessage = messagesWithoutDraft.some((message) => message.id === userMessage.id);
    const sourceMessages = hasCurrentUserMessage ? messagesWithoutDraft : [...messagesWithoutDraft, userMessage];

    return invalidateStaleSkillToolResults(sourceMessages, runtime.skillContentHashes);
  }

  /**
   * 将当前 assistant 草稿纳入下一轮模型上下文。
   * @param sourceMessages - 上一轮源消息
   * @param assistantMessage - 当前 assistant 草稿
   * @returns 下一轮源消息
   */
  function createContinuationSourceMessages(sourceMessages: ChatMessageRecord[], assistantMessage: ChatMessageRecord): ChatMessageRecord[] {
    const nextMessages = sourceMessages.filter((message) => message.id !== assistantMessage.id);
    return [...nextMessages, assistantMessage];
  }

  /**
   * 执行模型流与工具续轮，并把多轮 usage 汇总回 assistant。
   * @param runtime - runtime 状态
   * @param sourceMessages - 当前源消息
   * @param userMessage - user 消息
   * @param assistantMessage - assistant 草稿消息
   * @returns 汇总后的 usage
   */
  async function executeRuntimeStreamRounds(
    runtime: ActiveChatRuntime,
    sourceMessages: ChatMessageRecord[],
    userMessage: ChatMessageRecord,
    assistantMessage: ChatMessageRecord
  ): Promise<AIUsage | undefined> {
    let currentSourceMessages = sourceMessages;
    let streamResult = await streamExecutor({ runtime, sourceMessages: currentSourceMessages, userMessage, assistantMessage }, (message) =>
      updateAssistantMessage(runtime, message)
    );
    if (!activeRuntimes.has(runtime.runtimeId)) {
      throw new ChatRuntimeError('RUNTIME_NOT_ACTIVE', `Runtime ${runtime.runtimeId} is not active`);
    }

    let accumulatedUsage = addRuntimeUsage(undefined, streamResult.usage);
    let continuationRound = 0;
    while (streamResult.shouldContinue && continuationRound < MAX_RUNTIME_CONTINUATION_ROUNDS) {
      continuationRound += 1;
      // 将上一轮 assistant 草稿纳入下一轮上下文，保证工具结果续轮能拿到 assistant 历史
      currentSourceMessages = createContinuationSourceMessages(currentSourceMessages, assistantMessage);
      // eslint-disable-next-line no-await-in-loop
      streamResult = await streamExecutor({ runtime, sourceMessages: currentSourceMessages, userMessage, assistantMessage }, (message) =>
        updateAssistantMessage(runtime, message)
      );
      if (!activeRuntimes.has(runtime.runtimeId)) {
        throw new ChatRuntimeError('RUNTIME_NOT_ACTIVE', `Runtime ${runtime.runtimeId} is not active`);
      }
      accumulatedUsage = addRuntimeUsage(accumulatedUsage, streamResult.usage);
    }

    await finishAssistantMessageIfNeeded(runtime, assistantMessage, accumulatedUsage);

    if (accumulatedUsage && !isSameRuntimeUsage(assistantMessage.usage, accumulatedUsage)) {
      assistantMessage.usage = accumulatedUsage;
      await updateAssistantMessage(runtime, assistantMessage);
    }

    return accumulatedUsage;
  }

  /**
   * 后台执行模型流并收尾 runtime。
   * @param runtime - runtime 状态
   * @param userMessage - user 消息
   * @param assistantMessage - assistant 草稿消息
   * @param sourceMessageSnapshot - 可选的续轮消息快照
   */
  async function runRuntimeStream(
    runtime: ActiveChatRuntime,
    userMessage: ChatMessageRecord,
    assistantMessage: ChatMessageRecord,
    sourceMessageSnapshot?: ChatMessageRecord[]
  ): Promise<void> {
    try {
      const sourceMessages = sourceMessageSnapshot
        ? invalidateStaleSkillToolResults(sourceMessageSnapshot, runtime.skillContentHashes)
        : await readRuntimeSourceMessages(runtime, userMessage, assistantMessage);
      const accumulatedUsage = await executeRuntimeStreamRounds(runtime, sourceMessages, userMessage, assistantMessage);
      await pruneOldToolOutputsIfNeeded(runtime, sourceMessages, assistantMessage);
      completeRuntime(runtime, accumulatedUsage, isAssistantAwaitingUserInput(assistantMessage) ? 'awaiting_user_input' : 'completed');
    } catch (error) {
      if (!activeRuntimes.has(runtime.runtimeId)) return;

      const runtimeError = normalizeRuntimeStreamError(error);
      markAssistantMessageFailed(assistantMessage, runtimeError);
      await updateAssistantMessage(runtime, assistantMessage);
      emit('chat:runtime:error', {
        runtimeId: runtime.runtimeId,
        sessionId: runtime.sessionId,
        clientId: runtime.clientId,
        agentId: runtime.agentId,
        parentRuntimeId: runtime.parentRuntimeId,
        error: runtimeError
      });
      completeRuntime(runtime);
    }
  }

  return {
    /**
     * 启动一轮 ChatRuntime。
     * @param input - 发送内容与 renderer 快照
     * @returns 已启动 runtime 标识
     */
    async send(input: ChatRuntimeSendInput): Promise<ChatRuntimeStartResult> {
      const sessionId = input.sessionId ?? `session-${nanoid()}`;
      const { runtimeId } = input;
      assertRuntimeIdAvailable(runtimeId);
      const lock = locks.acquireWritingLock({ sessionId, runtimeId });

      if (!lock.ok) {
        throw new ChatRuntimeError('SESSION_BUSY', `Session ${sessionId} is already running ${lock.ownerRuntimeId}`);
      }

      const runtime = createSendRuntime(input, runtimeId, sessionId);
      activeRuntimes.set(runtimeId, runtime);

      try {
        const createdAt = input.userMessageCreatedAt ?? now();
        const userParts = input.parts?.length
          ? await materializeFileParts({
              parts: input.parts,
              runtime,
              now,
              requestBridge: bridgeRequests.request
            })
          : undefined;
        if (!activeRuntimes.has(runtimeId)) {
          throw new ChatRuntimeError('RUNTIME_NOT_ACTIVE', `Runtime ${runtimeId} was aborted before message persistence`);
        }
        const userMessage = createRuntimeUserMessage({ ...input, parts: userParts }, runtime, input.userMessageId ?? createMessageId('user'), createdAt);
        const assistantMessage = createRuntimeAssistantPlaceholder(runtime, createMessageId('assistant'), createdAt);
        activeAssistantMessages.set(runtimeId, assistantMessage);

        await messageWriter.addMessage(userMessage);
        emit('chat:runtime:message-created', {
          runtimeId,
          sessionId,
          clientId: runtime.clientId,
          agentId: runtime.agentId,
          parentRuntimeId: runtime.parentRuntimeId,
          message: userMessage
        });

        await messageWriter.addMessage(assistantMessage);
        emit('chat:runtime:message-created', {
          runtimeId,
          sessionId,
          clientId: runtime.clientId,
          agentId: runtime.agentId,
          parentRuntimeId: runtime.parentRuntimeId,
          message: assistantMessage
        });

        if (!dependencies.keepRuntimeOpenForTest) {
          runRuntimeStream(runtime, userMessage, assistantMessage).catch(() => undefined);
        }
      } catch (error) {
        activeRuntimes.delete(runtime.runtimeId);
        activeAssistantMessages.delete(runtime.runtimeId);
        rendererToolRequests.rejectRuntime(runtime.runtimeId, 'Runtime start failed');
        confirmationRequests.rejectRuntime(runtime.runtimeId, 'Runtime start failed');
        bridgeRequests.rejectRuntime(runtime.runtimeId, 'Runtime start failed');
        locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
        throw error;
      }

      return { runtimeId, sessionId };
    },

    /**
     * 继续一轮已暂停的 assistant 消息。
     * @param input - 续轮输入
     * @returns 已启动 runtime 标识
     */
    async continue(input: ChatRuntimeContinueInput): Promise<ChatRuntimeStartResult> {
      const { runtimeId } = input;
      assertRuntimeIdAvailable(runtimeId);
      const lock = locks.acquireWritingLock({ sessionId: input.sessionId, runtimeId });
      if (!lock.ok) {
        throw new ChatRuntimeError('SESSION_BUSY', `Session ${input.sessionId} is already running ${lock.ownerRuntimeId}`);
      }

      const continuationMessages = normalizeContinuationMessages(input);
      const userMessage = findLastRuntimeUserMessage(continuationMessages);
      const existingAssistantMessage = findLastRuntimeAssistantMessage(continuationMessages);
      if (!userMessage) {
        locks.releaseWritingLock({ sessionId: input.sessionId, runtimeId });
        throw new ChatRuntimeError('INVALID_CONTINUATION', 'Continuation requires a user message');
      }

      const runtime = createContinuationRuntime(input, runtimeId);
      activeRuntimes.set(runtimeId, runtime);
      const createdAt = now();
      const assistantMessage = existingAssistantMessage ?? createRuntimeAssistantPlaceholder(runtime, createMessageId('assistant'), createdAt);
      ensureRuntimeMessageCreatedAt(assistantMessage, createdAt);
      assistantMessage.runtimeId = runtimeId;
      assistantMessage.agentId = runtime.agentId;
      assistantMessage.parentRuntimeId = runtime.parentRuntimeId;
      assistantMessage.loading = true;
      assistantMessage.finished = false;
      activeAssistantMessages.set(runtimeId, assistantMessage);
      const sourceMessageSnapshot = existingAssistantMessage
        ? continuationMessages.map((message) => (message.id === assistantMessage.id ? assistantMessage : message))
        : [...continuationMessages, assistantMessage];

      try {
        if (existingAssistantMessage) {
          await messageWriter.updateMessage(assistantMessage);
          emit('chat:runtime:message-updated', {
            runtimeId,
            sessionId: runtime.sessionId,
            clientId: runtime.clientId,
            agentId: runtime.agentId,
            parentRuntimeId: runtime.parentRuntimeId,
            message: assistantMessage
          });
        } else {
          await messageWriter.addMessage(assistantMessage);
          emit('chat:runtime:message-created', {
            runtimeId,
            sessionId: runtime.sessionId,
            clientId: runtime.clientId,
            agentId: runtime.agentId,
            parentRuntimeId: runtime.parentRuntimeId,
            message: assistantMessage
          });
        }

        if (!dependencies.keepRuntimeOpenForTest) {
          runRuntimeStream(runtime, userMessage, assistantMessage, sourceMessageSnapshot).catch(() => undefined);
        }
      } catch (error) {
        activeRuntimes.delete(runtime.runtimeId);
        activeAssistantMessages.delete(runtime.runtimeId);
        rendererToolRequests.rejectRuntime(runtime.runtimeId, 'Runtime continue failed');
        confirmationRequests.rejectRuntime(runtime.runtimeId, 'Runtime continue failed');
        bridgeRequests.rejectRuntime(runtime.runtimeId, 'Runtime continue failed');
        locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
        throw error;
      }

      return { runtimeId, sessionId: runtime.sessionId };
    },

    /**
     * 提交用户选择答案并从主进程持久化消息续跑。
     * @param input - 用户选择提交输入
     * @returns 已启动 runtime 标识
     */
    async submitUserChoice(input: ChatRuntimeSubmitUserChoiceInput): Promise<ChatRuntimeStartResult> {
      const { runtimeId } = input;
      assertRuntimeIdAvailable(runtimeId);
      const lock = locks.acquireWritingLock({ sessionId: input.sessionId, runtimeId });
      if (!lock.ok) {
        throw new ChatRuntimeError('SESSION_BUSY', `Session ${input.sessionId} is already running ${lock.ownerRuntimeId}`);
      }

      const runtime = createUserChoiceRuntime(input, runtimeId);
      activeRuntimes.set(runtimeId, runtime);

      try {
        const continuationMessages = (await messageReader.getMessages(input.sessionId)).map(cloneRuntimeMessage);
        if (!activeRuntimes.has(runtimeId)) {
          throw new ChatRuntimeError('RUNTIME_NOT_ACTIVE', `Runtime ${runtimeId} was aborted before continuation started`);
        }
        const assistantMessage = applyUserChoiceAnswer(continuationMessages, input.answer);
        const userMessage = findLastRuntimeUserMessage(continuationMessages);
        if (!userMessage || !assistantMessage) {
          throw new ChatRuntimeError('USER_CHOICE_NOT_FOUND', 'No pending user choice was found');
        }

        ensureRuntimeMessageCreatedAt(assistantMessage, now());
        assistantMessage.runtimeId = runtimeId;
        assistantMessage.agentId = runtime.agentId;
        assistantMessage.parentRuntimeId = runtime.parentRuntimeId;
        assistantMessage.loading = true;
        assistantMessage.finished = false;
        activeAssistantMessages.set(runtimeId, assistantMessage);
        const sourceMessageSnapshot = continuationMessages.map((message) => (message.id === assistantMessage.id ? assistantMessage : message));
        await messageWriter.updateMessage(assistantMessage);
        emit('chat:runtime:message-updated', {
          runtimeId,
          sessionId: runtime.sessionId,
          clientId: runtime.clientId,
          agentId: runtime.agentId,
          parentRuntimeId: runtime.parentRuntimeId,
          message: assistantMessage
        });

        if (!dependencies.keepRuntimeOpenForTest) {
          runRuntimeStream(runtime, userMessage, assistantMessage, sourceMessageSnapshot).catch(() => undefined);
        }
      } catch (error) {
        activeRuntimes.delete(runtime.runtimeId);
        activeAssistantMessages.delete(runtime.runtimeId);
        rendererToolRequests.rejectRuntime(runtime.runtimeId, 'Runtime user choice submit failed');
        confirmationRequests.rejectRuntime(runtime.runtimeId, 'Runtime user choice submit failed');
        bridgeRequests.rejectRuntime(runtime.runtimeId, 'Runtime user choice submit failed');
        locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
        throw error;
      }

      return { runtimeId, sessionId: runtime.sessionId };
    },

    /**
     * 请求 renderer 展示确认弹窗并等待决策。
     * @param input - 确认请求输入
     * @returns renderer 确认决策
     */
    requestConfirmation(input: RuntimeConfirmationRequestInput): Promise<ChatRuntimeConfirmationDecision> {
      return confirmationRequests.request(input);
    },

    /**
     * 提交 renderer 确认决策。
     * @param input - 确认决策输入
     */
    submitConfirmation(input: ChatRuntimeSubmitConfirmationInput): void {
      confirmationRequests.submit(input);
    },

    /**
     * 请求 renderer 执行通用 bridge 操作并等待结果。
     * @param input - bridge 请求输入
     * @returns renderer bridge 结果
     */
    requestBridge(input: RuntimeBridgeRequestInput): Promise<ChatRuntimeBridgeResult> {
      return bridgeRequests.request(input);
    },

    /**
     * 提交 renderer bridge 响应。
     * @param input - bridge 响应输入
     */
    submitBridgeResponse(input: ChatRuntimeBridgeResponseInput): void {
      bridgeRequests.submit(input);
    },

    /**
     * 自动生成并持久化会话标题。
     * @param input - 自动命名输入
     * @returns 自动命名结果
     */
    async autoName(input: ChatRuntimeAutoNameInput): Promise<ChatRuntimeAutoNameResult> {
      const resolution = await autoNameResolver();
      if (!resolution) {
        return { status: 'skipped', reason: 'no_model_config' };
      }

      const [error, result] = await autoNameGenerateText(resolution.createOptions, {
        modelId: resolution.modelId,
        prompt: createAutoNamePrompt(input)
      });
      if (error) {
        return { status: 'failed', errorMessage: error.message };
      }

      const title = normalizeAutoNameTitle(result.text);
      if (!title) {
        return { status: 'skipped', reason: 'empty_title' };
      }

      try {
        await autoNameUpdateSessionTitle(input.sessionId, title);
      } catch (persistError: unknown) {
        const message = persistError instanceof Error ? persistError.message : String(persistError);
        return { status: 'failed', errorMessage: message };
      }

      return { status: 'success', title };
    },

    /**
     * 中止指定 runtime。
     * @param input - 中止参数
     */
    async abort(input: ChatRuntimeAbortInput): Promise<void> {
      const runtime = activeRuntimes.get(input.runtimeId);
      if (!runtime) return;

      runtime.abortController.abort();
      activeRuntimes.delete(runtime.runtimeId);
      const assistantMessage = activeAssistantMessages.get(runtime.runtimeId);
      activeAssistantMessages.delete(runtime.runtimeId);
      rendererToolRequests.rejectRuntime(runtime.runtimeId, 'Runtime aborted');
      confirmationRequests.rejectRuntime(runtime.runtimeId, 'Runtime aborted');
      bridgeRequests.rejectRuntime(runtime.runtimeId, 'Runtime aborted');
      locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
      await streamAbort(runtime.runtimeId);

      if (!assistantMessage) return;

      if (!hasAssistantResponseContent(assistantMessage)) {
        await deleteAssistantMessage(runtime, assistantMessage);
      } else {
        finishAssistantMessageInterrupted(assistantMessage);
        await messageWriter.updateMessage(assistantMessage);
        emit('chat:runtime:message-updated', {
          runtimeId: runtime.runtimeId,
          sessionId: runtime.sessionId,
          clientId: runtime.clientId,
          agentId: runtime.agentId,
          parentRuntimeId: runtime.parentRuntimeId,
          message: assistantMessage
        });
      }

      const interruptMessage = createRuntimeInterruptMessage(runtime, createMessageId('interrupt'), now());
      await messageWriter.addMessage(interruptMessage);
      emit('chat:runtime:message-created', {
        runtimeId: runtime.runtimeId,
        sessionId: runtime.sessionId,
        clientId: runtime.clientId,
        agentId: runtime.agentId,
        parentRuntimeId: runtime.parentRuntimeId,
        message: interruptMessage
      });
    },

    /**
     * 提交 renderer 本地工具执行结果。
     * @param input - 工具结果
     */
    submitToolResult(input: ChatRuntimeSubmitToolResultInput): void {
      rendererToolRequests.submit(input);
    },

    /**
     * 提交 renderer 侧产生的消息片段更新。
     * @param input - 消息片段更新输入
     */
    async submitMessagePart(input: ChatRuntimeSubmitMessagePartInput): Promise<void> {
      const runtime = activeRuntimes.get(input.runtimeId);
      if (!runtime) {
        throw new ChatRuntimeError('RUNTIME_NOT_ACTIVE', `Runtime ${input.runtimeId} is not active`);
      }

      const assistantMessage = activeAssistantMessages.get(runtime.runtimeId);
      if (!assistantMessage || assistantMessage.id !== input.messageId) {
        throw new ChatRuntimeError('MESSAGE_NOT_ACTIVE', `Message ${input.messageId} is not active in runtime ${input.runtimeId}`);
      }

      const partIndex = assistantMessage.parts.findIndex((part): boolean => part.id === input.part.id);
      if (partIndex < 0) {
        throw new ChatRuntimeError('MESSAGE_PART_NOT_ACTIVE', `Message part ${input.part.id} is not active in message ${input.messageId}`);
      }

      assistantMessage.parts.splice(partIndex, 1, { ...input.part });
      await updateAssistantMessage(runtime, assistantMessage);
    },

    /**
     * 读取 renderer 重建所需的活跃 Runtime 投影。
     * @returns 按创建时间排序的可克隆 Runtime 快照
     */
    listRecoverySnapshots(): ChatRuntimeRecoverySnapshot[] {
      return [...activeRuntimes.values()]
        .filter((runtime): boolean => runtime.status !== 'completed')
        .sort((left, right): number => left.createdAt - right.createdAt)
        .map(
          (runtime): ChatRuntimeRecoverySnapshot => ({
            runtimeId: runtime.runtimeId,
            sessionId: runtime.sessionId,
            clientId: runtime.clientId,
            agentId: runtime.agentId,
            parentRuntimeId: runtime.parentRuntimeId,
            phase: runtime.phase,
            createdAt: runtime.createdAt,
            capabilities: runtime.capabilities ? { ...runtime.capabilities, rendererToolNames: [...runtime.capabilities.rendererToolNames] } : undefined,
            pendingRequests: [
              ...rendererToolRequests.listPending(runtime.runtimeId),
              ...confirmationRequests.listPending(runtime.runtimeId),
              ...bridgeRequests.listPending(runtime.runtimeId)
            ]
          })
        );
    },

    /**
     * 读取活跃 runtime，供测试和诊断使用。
     * @param runtimeId - runtime id
     * @returns 活跃 runtime
     */
    getActiveRuntime(runtimeId: string): ActiveChatRuntime | undefined {
      return activeRuntimes.get(runtimeId);
    }
  };
}

/** IPC handlers 使用的默认 ChatRuntime 单例。 */
export const chatRuntimeService = createChatRuntimeService();

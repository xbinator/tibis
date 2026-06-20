/**
 * @file service.mts
 * @description 主进程 ChatRuntime 服务骨架。
 */
import type { RuntimeCompactionService } from './compaction/service.mjs';
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
import type { ChatMessageRecord } from 'types/chat';
import type {
  ChatRuntimeAbortInput,
  ChatRuntimeAutoNameInput,
  ChatRuntimeAutoNameResult,
  ChatRuntimeBridgeResponseInput,
  ChatRuntimeBridgeResult,
  ChatRuntimeCompactInput,
  ChatRuntimeCompactResult,
  ChatRuntimeConfirmationDecision,
  ChatRuntimeContinueInput,
  ChatRuntimeContextUsageSnapshot,
  ChatRuntimeSendInput,
  ChatRuntimeStartResult,
  ChatRuntimeSubmitConfirmationInput,
  ChatRuntimeSubmitUserChoiceInput,
  ChatRuntimeSubmitToolResultInput
} from 'types/chat-runtime';
import type { CompressionRecord, CompressionRecordStatus, CompressionRecordStorage } from 'types/compression';
import { BrowserWindow } from 'electron';
import { nanoid } from 'nanoid';
import { AI_ERROR_CODE, createAIServiceError, isAIServiceError } from '../../ai/errors/codes.mjs';
import { aiService } from '../../ai/service.mjs';
import { chatSessionManager } from '../service.mjs';
import { createRuntimeCompressionExecutor } from './compaction/executor.mjs';
import { createRuntimeCompactionService } from './compaction/service.mjs';
import { createRuntimeStructuredSummaryGenerator, createRuntimeSummaryInvoke } from './compaction/structured-summary-generator.mjs';
import { createContextBudgetService } from './context/budget.mjs';
import { estimateSerializedModelMessages } from './context/estimator.mjs';
import { toRuntimeModelMessages } from './context/model-message.mjs';
import { downgradeOverflowReplaySourceMessages, downgradeUserMessageForOverflowReplay, isContextOverflowError } from './context/overflow.mjs';
import { findToolOutputPruneProtectedStartIndex, pruneMessageToolOutputs } from './context/tool-output-prune.mjs';
import { addRuntimeUsage, isSameRuntimeUsage } from './context/usage.mjs';
import { createRuntimeBridgeRequests, type RuntimeBridgeRequestInput } from './controllers/bridge.mjs';
import { createRuntimeConfirmationRequests, type RuntimeConfirmationRequestInput } from './controllers/confirmation.mjs';
import { createRuntimeRendererToolRequests } from './controllers/renderer-tool.mjs';
import { ChatRuntimeError } from './errors.mjs';
import { createRuntimeLockRegistry } from './infrastructure/locks.mjs';
import { findLastRuntimeAssistantMessage, findLastRuntimeUserMessage, normalizeContinuationMessages } from './messages/continuation.mjs';
import { createRuntimeAssistantPlaceholder, createRuntimeInterruptMessage, createRuntimeUserMessage } from './messages/factory.mjs';
import {
  ensureRuntimeMessageCreatedAt,
  finishAssistantMessageInterrupted,
  hasAssistantResponseContent,
  markAssistantMessageFailed
} from './messages/finalizer.mjs';
import { applyUserChoiceAnswer, cloneRuntimeMessage } from './messages/user-choice.mjs';
import { createAutoNamePrompt, normalizeAutoNameTitle } from './model/auto-name.mjs';
import { createDefaultChatModelResolver } from './model/resolver.mjs';
import { createCompactRuntime, createContinuationRuntime, createSendRuntime, createUserChoiceRuntime } from './runners/factory.mjs';
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
 * 创建默认压缩记录存储 adapter。
 * @returns 压缩记录存储 adapter
 */
function createDefaultCompressionStorage(): CompressionRecordStorage {
  return {
    async getLatestValidRecord(sessionId: string): Promise<CompressionRecord | undefined> {
      return chatSessionManager.getLatestValidRecord(sessionId);
    },

    async createRecord(record: Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CompressionRecord> {
      return chatSessionManager.createRecord(record);
    },

    async updateRecordStatus(id: string, status: CompressionRecordStatus, invalidReason?: string): Promise<void> {
      chatSessionManager.updateRecordStatus(id, status, invalidReason);
    },

    async getAllRecords(sessionId: string): Promise<CompressionRecord[]> {
      return chatSessionManager.getAllRecords(sessionId);
    }
  };
}

/**
 * 创建默认 runtime compaction 服务。
 * @param emit - runtime 事件发送器
 * @returns runtime compaction 服务
 */
function createDefaultCompactionService(emit: ChatRuntimeServiceDependencies['emit']): RuntimeCompactionService {
  const summaryResolver = createDefaultChatModelResolver();
  const summaryGenerator = createRuntimeStructuredSummaryGenerator({
    invoke: createRuntimeSummaryInvoke(summaryResolver, (createOptions, request) => aiService.generateText(createOptions, request))
  });

  return createRuntimeCompactionService({
    emit,
    persistMessage: (message) => chatSessionManager.addMessage(message),
    updateMessage: (message) => chatSessionManager.updateMessage(message),
    compressor: createRuntimeCompressionExecutor(createDefaultCompressionStorage(), { summaryGenerator })
  });
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
  const compactionService = dependencies.compactionService ?? createDefaultCompactionService(emit);
  const messageWriter = dependencies.messageWriter ?? createDefaultMessageWriter();
  const messageReader = dependencies.messageReader ?? createDefaultMessageReader();
  const streamAbort = dependencies.streamAbort ?? createDefaultStreamAborter();
  const createMessageId = dependencies.createMessageId ?? createDefaultMessageId;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const autoNameResolver = dependencies.autoNameResolveModel ?? (() => createDefaultChatModelResolver().resolve());
  const autoNameGenerateText = dependencies.autoNameGenerateText ?? ((createOptions, request) => aiService.generateText(createOptions, request));
  const autoNameUpdateSessionTitle = dependencies.autoNameUpdateSessionTitle ?? ((sessionId, title) => chatSessionManager.updateSessionTitle(sessionId, title));
  const { rendererToolTimeoutMs } = dependencies;
  const contextBudget = createContextBudgetService();
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
   * 完成 runtime 并释放 session 写入锁。
   * @param runtime - 需要完成的 runtime
   * @param usage - Provider 返回的 usage
   */
  function completeRuntime(runtime: ActiveChatRuntime, usage?: AIUsage): void {
    runtime.status = 'completed';
    activeRuntimes.delete(runtime.runtimeId);
    activeAssistantMessages.delete(runtime.runtimeId);
    rendererToolRequests.rejectRuntime(runtime.runtimeId, 'Runtime completed');
    confirmationRequests.rejectRuntime(runtime.runtimeId, 'Runtime completed');
    bridgeRequests.rejectRuntime(runtime.runtimeId, 'Runtime completed');
    locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
    emit('chat:runtime:complete', {
      runtimeId: runtime.runtimeId,
      sessionId: runtime.sessionId,
      clientId: runtime.clientId,
      agentId: runtime.agentId,
      parentRuntimeId: runtime.parentRuntimeId,
      usage
    });
  }

  /**
   * 更新 assistant 草稿并发送 runtime 事件。
   * @param runtime - runtime 状态
   * @param message - assistant 草稿消息
   */
  async function updateAssistantMessage(runtime: ActiveChatRuntime, message: ChatMessageRecord): Promise<void> {
    if (!activeRuntimes.has(runtime.runtimeId)) return;

    await messageWriter.updateMessage(message);
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
   * 在指定 runtime 阶段内执行异步任务，结束后恢复原阶段。
   * @param runtime - runtime 状态
   * @param phase - 临时切换到的阶段
   * @param task - 需要执行的异步任务
   * @returns 异步任务结果
   */
  async function runRuntimePhase<T>(runtime: ActiveChatRuntime, phase: ActiveChatRuntime['phase'], task: () => Promise<T>): Promise<T> {
    const previousPhase = runtime.phase;
    runtime.phase = phase;

    try {
      return await task();
    } finally {
      if (activeRuntimes.has(runtime.runtimeId) && runtime.status === 'running') {
        runtime.phase = previousPhase;
      }
    }
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

    return hasCurrentUserMessage ? messagesWithoutDraft : [...messagesWithoutDraft, userMessage];
  }

  /**
   * 计算并广播 runtime 上下文用量。
   * @param runtime - runtime 状态
   * @param sourceMessages - 当前源消息
   * @returns 上下文用量快照
   */
  function emitContextUsageSnapshot(
    runtime: ActiveChatRuntime,
    sourceMessages: ChatMessageRecord[],
    providerUsageTokens?: number
  ): ChatRuntimeContextUsageSnapshot | undefined {
    if (runtime.contextWindow === undefined) return undefined;

    const modelMessages = toRuntimeModelMessages(sourceMessages);
    const snapshot = contextBudget.calculate({
      runtimeId: runtime.runtimeId,
      sessionId: runtime.sessionId,
      agentId: runtime.agentId,
      contextWindow: runtime.contextWindow,
      estimatedInputTokens: estimateSerializedModelMessages(modelMessages),
      providerUsageTokens
    });
    emit('chat:runtime:context-usage-updated', {
      runtimeId: runtime.runtimeId,
      sessionId: runtime.sessionId,
      clientId: runtime.clientId,
      agentId: runtime.agentId,
      parentRuntimeId: runtime.parentRuntimeId,
      snapshot
    });

    return snapshot;
  }

  /**
   * 在需要时执行发送前自动压缩，并返回最新源消息。
   * @param runtime - runtime 状态
   * @param sourceMessages - 压缩前源消息
   * @param userMessage - 当前用户消息
   * @param assistantMessage - 当前 assistant 草稿消息
   * @returns 可用于后续 streaming 的源消息
   */
  async function compactBeforeStreamIfNeeded(
    runtime: ActiveChatRuntime,
    sourceMessages: ChatMessageRecord[],
    userMessage: ChatMessageRecord,
    assistantMessage: ChatMessageRecord
  ): Promise<ChatMessageRecord[]> {
    const snapshot = emitContextUsageSnapshot(runtime, sourceMessages);
    if (!snapshot?.shouldCompactBeforeSend) return sourceMessages;

    const result = await runRuntimePhase(runtime, 'compacting', () =>
      compactionService.compact({
        runtimeId: runtime.runtimeId,
        sessionId: runtime.sessionId,
        clientId: runtime.clientId,
        agentId: runtime.agentId,
        parentRuntimeId: runtime.parentRuntimeId,
        reason: 'auto',
        contextWindow: runtime.contextWindow,
        messages: sourceMessages,
        signal: runtime.abortController.signal
      })
    );
    if (result.status !== 'success') return sourceMessages;

    return readRuntimeSourceMessages(runtime, userMessage, assistantMessage);
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
   * 根据 provider usage 在完成后触发自动压缩。
   * @param runtime - runtime 状态
   * @param sourceMessages - 当前源消息
   * @param assistantMessage - assistant 终态消息
   * @param usage - provider usage
   */
  async function compactAfterProviderUsageIfNeeded(
    runtime: ActiveChatRuntime,
    sourceMessages: ChatMessageRecord[],
    assistantMessage: ChatMessageRecord,
    usage: AIUsage | undefined
  ): Promise<void> {
    if (!usage || runtime.contextWindow === undefined) return;

    const completedMessages = createContinuationSourceMessages(sourceMessages, assistantMessage);
    const snapshot = emitContextUsageSnapshot(runtime, completedMessages, usage.totalTokens);
    if (!snapshot || snapshot.usableInputTokens === 0 || usage.totalTokens < snapshot.usableInputTokens) return;

    await runRuntimePhase(runtime, 'compacting', () =>
      compactionService.compact({
        runtimeId: runtime.runtimeId,
        sessionId: runtime.sessionId,
        clientId: runtime.clientId,
        agentId: runtime.agentId,
        parentRuntimeId: runtime.parentRuntimeId,
        reason: 'auto',
        contextWindow: runtime.contextWindow,
        messages: completedMessages,
        signal: runtime.abortController.signal
      })
    );
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

    if (accumulatedUsage && !isSameRuntimeUsage(assistantMessage.usage, accumulatedUsage)) {
      assistantMessage.usage = accumulatedUsage;
      await updateAssistantMessage(runtime, assistantMessage);
    }

    return accumulatedUsage;
  }

  /**
   * 尝试在上下文超限后压缩并重放当前用户轮次。
   * @param runtime - runtime 状态
   * @param sourceMessages - 溢出时使用的源消息
   * @param userMessage - user 消息
   * @param assistantMessage - assistant 草稿消息
   * @param error - 规范化 runtime 错误
   * @returns 是否已经完成重放处理
   */
  async function replayAfterContextOverflow(
    runtime: ActiveChatRuntime,
    sourceMessages: ChatMessageRecord[],
    userMessage: ChatMessageRecord,
    assistantMessage: ChatMessageRecord,
    error: AIServiceError
  ): Promise<boolean> {
    if (!isContextOverflowError(error) || hasAssistantResponseContent(assistantMessage)) return false;

    const compactResult = await runRuntimePhase(runtime, 'compacting', () =>
      compactionService.compact({
        runtimeId: runtime.runtimeId,
        sessionId: runtime.sessionId,
        clientId: runtime.clientId,
        agentId: runtime.agentId,
        parentRuntimeId: runtime.parentRuntimeId,
        reason: 'auto',
        contextWindow: runtime.contextWindow,
        messages: sourceMessages,
        signal: runtime.abortController.signal
      })
    );
    if (!activeRuntimes.has(runtime.runtimeId)) return true;
    if (compactResult.status !== 'success') return false;

    const replaySourceMessages = downgradeOverflowReplaySourceMessages(await readRuntimeSourceMessages(runtime, userMessage, assistantMessage), userMessage);
    const replayUserMessage = downgradeUserMessageForOverflowReplay(userMessage);
    const usage = await executeRuntimeStreamRounds(runtime, replaySourceMessages, replayUserMessage, assistantMessage);
    await compactAfterProviderUsageIfNeeded(runtime, replaySourceMessages, assistantMessage, usage);
    await pruneOldToolOutputsIfNeeded(runtime, replaySourceMessages, assistantMessage);
    completeRuntime(runtime, usage);
    return true;
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
    let sourceMessages: ChatMessageRecord[] = [];
    try {
      const initialSourceMessages = sourceMessageSnapshot ?? (await readRuntimeSourceMessages(runtime, userMessage, assistantMessage));
      sourceMessages = sourceMessageSnapshot ?? (await compactBeforeStreamIfNeeded(runtime, initialSourceMessages, userMessage, assistantMessage));
      if (sourceMessageSnapshot) emitContextUsageSnapshot(runtime, sourceMessageSnapshot);
      const accumulatedUsage = await executeRuntimeStreamRounds(runtime, sourceMessages, userMessage, assistantMessage);
      await compactAfterProviderUsageIfNeeded(runtime, sourceMessages, assistantMessage, accumulatedUsage);
      await pruneOldToolOutputsIfNeeded(runtime, sourceMessages, assistantMessage);
      completeRuntime(runtime, accumulatedUsage);
    } catch (error) {
      if (!activeRuntimes.has(runtime.runtimeId)) return;

      let runtimeError = normalizeRuntimeStreamError(error);
      try {
        if (await replayAfterContextOverflow(runtime, sourceMessages, userMessage, assistantMessage, runtimeError)) return;
      } catch (replayError: unknown) {
        if (!activeRuntimes.has(runtime.runtimeId)) return;
        runtimeError = normalizeRuntimeStreamError(replayError);
      }

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
      const runtimeId = `runtime-${nanoid()}`;
      const lock = locks.acquireWritingLock({ sessionId, runtimeId });

      if (!lock.ok) {
        throw new ChatRuntimeError('SESSION_BUSY', `Session ${sessionId} is already running ${lock.ownerRuntimeId}`);
      }

      const runtime = createSendRuntime(input, runtimeId, sessionId);
      activeRuntimes.set(runtimeId, runtime);

      try {
        const createdAt = input.userMessageCreatedAt ?? now();
        const userMessage = createRuntimeUserMessage(input, runtime, input.userMessageId ?? createMessageId('user'), createdAt);
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
      const runtimeId = `runtime-${nanoid()}`;
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
      const runtimeId = `runtime-${nanoid()}`;
      const lock = locks.acquireWritingLock({ sessionId: input.sessionId, runtimeId });
      if (!lock.ok) {
        throw new ChatRuntimeError('SESSION_BUSY', `Session ${input.sessionId} is already running ${lock.ownerRuntimeId}`);
      }

      const continuationMessages = (await messageReader.getMessages(input.sessionId)).map(cloneRuntimeMessage);
      const assistantMessage = applyUserChoiceAnswer(continuationMessages, input.answer);
      const userMessage = findLastRuntimeUserMessage(continuationMessages);
      if (!userMessage || !assistantMessage) {
        locks.releaseWritingLock({ sessionId: input.sessionId, runtimeId });
        throw new ChatRuntimeError('USER_CHOICE_NOT_FOUND', 'No pending user choice was found');
      }

      const runtime = createUserChoiceRuntime(input, runtimeId);
      activeRuntimes.set(runtimeId, runtime);
      ensureRuntimeMessageCreatedAt(assistantMessage, now());
      assistantMessage.runtimeId = runtimeId;
      assistantMessage.agentId = runtime.agentId;
      assistantMessage.parentRuntimeId = runtime.parentRuntimeId;
      assistantMessage.loading = true;
      assistantMessage.finished = false;
      activeAssistantMessages.set(runtimeId, assistantMessage);
      const sourceMessageSnapshot = continuationMessages.map((message) => (message.id === assistantMessage.id ? assistantMessage : message));

      try {
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

      runtime.status = 'aborting';
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

      if (runtime.phase === 'compacting') {
        if (!hasAssistantResponseContent(assistantMessage)) {
          await deleteAssistantMessage(runtime, assistantMessage);
        }
        return;
      }

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
     * 执行一次上下文压缩。
     * @param input - 压缩命令参数
     * @returns 压缩结果
     */
    async compact(input: ChatRuntimeCompactInput): Promise<ChatRuntimeCompactResult> {
      const runtime = createCompactRuntime(input);
      activeRuntimes.set(runtime.runtimeId, runtime);

      try {
        return await compactionService.compact({ ...input, signal: runtime.abortController.signal });
      } finally {
        activeRuntimes.delete(runtime.runtimeId);
      }
    },

    /**
     * 提交 renderer 本地工具执行结果。
     * @param input - 工具结果
     */
    submitToolResult(input: ChatRuntimeSubmitToolResultInput): void {
      rendererToolRequests.submit(input);
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

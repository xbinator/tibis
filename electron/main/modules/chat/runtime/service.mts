/**
 * @file service.mts
 * @description 主进程 ChatRuntime 服务骨架。
 */
import type { RuntimeCompactionService } from './compaction.mjs';
import type {
  ActiveChatRuntime,
  ChatRuntimeMessageReader,
  ChatRuntimeMessageKind,
  ChatRuntimeMessageWriter,
  ChatRuntimeRendererToolExecutionInput,
  ChatRuntimeServiceDependencies,
  ChatRuntimeStreamAborter,
  ChatRuntimeStreamExecutor
} from './types.mjs';
import type { AIServiceError, AIToolExecutionCancelledResult, AIToolExecutionResult, AIUsage } from 'types/ai';
import type { ChatMessageRecord, ChatMessageToolPart } from 'types/chat';
import type {
  ChatRuntimeAbortInput,
  ChatRuntimeAutoNameInput,
  ChatRuntimeAutoNameResult,
  ChatRuntimeCompactInput,
  ChatRuntimeCompactResult,
  ChatRuntimeContinueInput,
  ChatRuntimeContextUsageSnapshot,
  ChatRuntimeSendInput,
  ChatRuntimeStartResult,
  ChatRuntimeSubmitToolResultInput
} from 'types/chat-runtime';
import type { CompressionRecord, CompressionRecordStatus, CompressionRecordStorage } from 'types/compression';
import { BrowserWindow } from 'electron';
import { nanoid } from 'nanoid';
import { AI_ERROR_CODE, createAIServiceError, isAIServiceError } from '../../ai/errors/codes.mjs';
import { aiService } from '../../ai/service.mjs';
import { chatSessionManager } from '../service.mjs';
import { createDefaultChatModelResolver } from './chat-model-resolver.mjs';
import { createRuntimeCompactionService } from './compaction.mjs';
import { createRuntimeCompressionExecutor } from './compression-executor.mjs';
import { createContextBudgetService } from './context-budget.mjs';
import { estimateSerializedModelMessages } from './context-estimator.mjs';
import { createRuntimeLockRegistry } from './locks.mjs';
import { toRuntimeModelMessages } from './model-message-context.mjs';
import { createRuntimeStreamExecutor } from './stream-executor.mjs';
import { createRuntimeStructuredSummaryGenerator, createRuntimeSummaryInvoke } from './structured-summary-generator.mjs';

/** 单个 runtime 内工具续轮最大次数。 */
const MAX_RUNTIME_CONTINUATION_ROUNDS = 25;

/** 自动命名默认 Prompt 模板。 */
const AUTONAME_DEFAULT_PROMPT = `# Role
你是一个会话标题生成器。

# Task
根据用户与 AI 的对话内容，生成一个简洁准确的会话标题。

# Rules
1. 标题长度不超过 20 个汉字
2. 标题应概括对话的核心主题，而非描述对话格式
3. 只输出标题文本，不要包含引号、标点或任何额外说明
4. 使用用户使用的语言（中文对话输出中文标题，英文对话输出英文标题）

# Conversation
用户: {{USER_MESSAGE}}

AI: {{AI_RESPONSE}}

# Title
`;

/** 等待 renderer 回传的工具请求。 */
interface PendingRendererToolRequest {
  /** 完成工具请求。 */
  resolve: (result: AIToolExecutionResult) => void;
  /** 拒绝工具请求。 */
  reject: (error: Error) => void;
}

/** Runtime 稳定错误。 */
export class ChatRuntimeError extends Error {
  /** 稳定错误码。 */
  code: string;

  /**
   * 创建 runtime 错误。
   * @param code - 稳定错误码
   * @param message - 错误描述
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ChatRuntimeError';
    this.code = code;
  }
}

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
  executeRendererTool?: (input: ChatRuntimeRendererToolExecutionInput) => Promise<AIToolExecutionResult>
): ChatRuntimeStreamExecutor {
  const resolver = createDefaultChatModelResolver();
  return createRuntimeStreamExecutor({
    resolver,
    streamText: (createOptions, request) => aiService.streamText(createOptions, request),
    executeRendererTool
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
 * 创建 runtime user 消息。
 * @param input - 发送参数
 * @param runtime - runtime 状态
 * @param id - 消息 ID
 * @param createdAt - 创建时间
 * @returns user 消息
 */
function createRuntimeUserMessage(input: ChatRuntimeSendInput, runtime: ActiveChatRuntime, id: string, createdAt: string): ChatMessageRecord {
  return {
    id,
    sessionId: runtime.sessionId,
    role: 'user',
    content: input.content,
    parts: input.content ? [{ type: 'text', text: input.content }] : [],
    files: input.files,
    createdAt,
    finished: true,
    loading: false,
    agentId: runtime.agentId,
    runtimeId: runtime.runtimeId,
    parentRuntimeId: runtime.parentRuntimeId
  };
}

/**
 * 创建 runtime assistant 占位消息。
 * @param runtime - runtime 状态
 * @param id - 消息 ID
 * @param createdAt - 创建时间
 * @returns assistant 占位消息
 */
function createRuntimeAssistantPlaceholder(runtime: ActiveChatRuntime, id: string, createdAt: string): ChatMessageRecord {
  return {
    id,
    sessionId: runtime.sessionId,
    role: 'assistant',
    content: '',
    parts: [],
    createdAt,
    loading: true,
    finished: false,
    agentId: runtime.agentId,
    runtimeId: runtime.runtimeId,
    parentRuntimeId: runtime.parentRuntimeId
  };
}

/**
 * 创建 runtime 中断状态消息。
 * @param runtime - runtime 状态
 * @param id - 消息 ID
 * @param createdAt - 创建时间
 * @returns 中断消息
 */
function createRuntimeInterruptMessage(runtime: ActiveChatRuntime, id: string, createdAt: string): ChatMessageRecord {
  return {
    id,
    sessionId: runtime.sessionId,
    role: 'interrupt',
    content: '已中断',
    parts: [],
    createdAt,
    loading: false,
    finished: true,
    agentId: runtime.agentId,
    runtimeId: runtime.runtimeId,
    parentRuntimeId: runtime.parentRuntimeId
  };
}

/**
 * 从消息快照中查找最后一条 user 消息。
 * @param messages - 消息快照
 * @returns user 消息
 */
function findLastRuntimeUserMessage(messages: ChatMessageRecord[]): ChatMessageRecord | undefined {
  return [...messages].reverse().find((message) => message.role === 'user');
}

/**
 * 从消息快照中查找最后一条 assistant 消息。
 * @param messages - 消息快照
 * @returns assistant 消息
 */
function findLastRuntimeAssistantMessage(messages: ChatMessageRecord[]): ChatMessageRecord | undefined {
  return [...messages].reverse().find((message) => message.role === 'assistant');
}

/**
 * 将 renderer 续轮消息快照补齐为主进程持久化消息。
 * @param input - 续轮输入
 * @returns 可写入主进程存储的消息列表
 */
function normalizeContinuationMessages(input: ChatRuntimeContinueInput): ChatMessageRecord[] {
  return input.messages.map((message) => ({
    ...message,
    sessionId: message.sessionId ?? input.sessionId
  }));
}

/**
 * 创建续轮 runtime 状态。
 * @param input - 续轮输入
 * @param runtimeId - runtime id
 * @returns runtime 状态
 */
function createContinuationRuntime(input: ChatRuntimeContinueInput, runtimeId: string): ActiveChatRuntime {
  return {
    runtimeId,
    sessionId: input.sessionId,
    clientId: input.clientId,
    agentId: input.agentId,
    parentRuntimeId: input.parentRuntimeId,
    contextWindow: input.contextWindow,
    system: input.system,
    tools: input.tools,
    tavily: input.tavily,
    mcp: input.mcp,
    status: 'running',
    abortController: new AbortController(),
    createdAt: Date.now()
  };
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
 * 将 assistant 草稿标记为失败终态。
 * @param message - assistant 草稿消息
 * @param error - runtime 错误
 */
function markAssistantMessageFailed(message: ChatMessageRecord, error: AIServiceError): void {
  message.content = message.content ? `${message.content}\n${error.message}` : error.message;
  message.parts.push({ type: 'error', text: error.message });
  message.loading = false;
  message.finished = true;
}

/**
 * 将未完成工具片段标记为已取消。
 * @param message - assistant 草稿消息
 */
function finalizeToolPartsAsCancelled(message: ChatMessageRecord): void {
  for (const part of message.parts) {
    if (part.type !== 'tool' || part.status === 'done') continue;

    const toolPart = part as ChatMessageToolPart;
    toolPart.status = 'done';
    toolPart.result = {
      toolName: toolPart.toolName,
      status: 'cancelled',
      error: { code: 'USER_CANCELLED', message: '用户中止了操作' }
    } satisfies AIToolExecutionCancelledResult;
    delete toolPart.inputText;
  }
}

/**
 * 将 assistant 草稿标记为中断后的稳定终态。
 * @param message - assistant 草稿消息
 */
function finishAssistantMessageInterrupted(message: ChatMessageRecord): void {
  finalizeToolPartsAsCancelled(message);
  message.loading = false;
  message.finished = true;
}

/**
 * 判断 assistant 草稿是否已有可保留的模型响应。
 * @param message - assistant 草稿消息
 * @returns 是否已有模型输出内容
 */
function hasAssistantResponseContent(message: ChatMessageRecord): boolean {
  return Boolean(message.content.trim() || message.thinking?.trim() || message.parts.length > 0);
}

/**
 * 汇总多轮模型流的 usage。
 * @param current - 当前累计 usage
 * @param next - 新一轮流式 usage
 * @returns 累加后的 usage
 */
function addRuntimeUsage(current: AIUsage | undefined, next: AIUsage | undefined): AIUsage | undefined {
  if (!next) return current;

  return {
    inputTokens: (current?.inputTokens ?? 0) + next.inputTokens,
    outputTokens: (current?.outputTokens ?? 0) + next.outputTokens,
    totalTokens: (current?.totalTokens ?? 0) + next.totalTokens
  };
}

/**
 * 判断两份 usage 是否一致。
 * @param left - 左侧 usage
 * @param right - 右侧 usage
 * @returns 是否一致
 */
function isSameRuntimeUsage(left: AIUsage | undefined, right: AIUsage | undefined): boolean {
  return left?.inputTokens === right?.inputTokens && left?.outputTokens === right?.outputTokens && left?.totalTokens === right?.totalTokens;
}

/**
 * 构建自动命名 prompt。
 * @param input - 自动命名输入
 * @returns prompt 文本
 */
function createAutoNamePrompt(input: ChatRuntimeAutoNameInput): string {
  return AUTONAME_DEFAULT_PROMPT.replace(/\{\{USER_MESSAGE\}\}/g, input.userMessage).replace(/\{\{AI_RESPONSE\}\}/g, input.aiResponse);
}

/**
 * 清理模型输出的标题文本。
 * @param text - 原始模型输出
 * @returns 标题文本
 */
function normalizeAutoNameTitle(text: string): string {
  return text.replace(/(^["'\u201c\u201d\u2018\u2019]+)|(["'\u201c\u201d\u2018\u2019]+$)/g, '').trim();
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
  const pendingRendererToolRequests = new Map<string, PendingRendererToolRequest>();
  const streamAbort = dependencies.streamAbort ?? createDefaultStreamAborter();
  const createMessageId = dependencies.createMessageId ?? createDefaultMessageId;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const autoNameResolver = dependencies.autoNameResolveModel ?? (() => createDefaultChatModelResolver().resolve());
  const autoNameGenerateText = dependencies.autoNameGenerateText ?? ((createOptions, request) => aiService.generateText(createOptions, request));
  const autoNameUpdateSessionTitle = dependencies.autoNameUpdateSessionTitle ?? ((sessionId, title) => chatSessionManager.updateSessionTitle(sessionId, title));
  const contextBudget = createContextBudgetService();
  const locks = createRuntimeLockRegistry();
  const activeRuntimes = new Map<string, ActiveChatRuntime>();
  const activeAssistantMessages = new Map<string, ChatMessageRecord>();

  /**
   * 创建 renderer 工具请求 key。
   * @param runtimeId - runtime id
   * @param toolCallId - 工具调用 id
   * @returns pending key
   */
  function createToolRequestKey(runtimeId: string, toolCallId: string): string {
    return `${runtimeId}:${toolCallId}`;
  }

  /**
   * 拒绝指定 runtime 所有等待中的工具请求。
   * @param runtimeId - runtime id
   * @param reason - 拒绝原因
   */
  function rejectRuntimeToolRequests(runtimeId: string, reason: string): void {
    for (const [key, request] of pendingRendererToolRequests) {
      if (!key.startsWith(`${runtimeId}:`)) continue;

      request.reject(new ChatRuntimeError('TOOL_REQUEST_CANCELLED', reason));
      pendingRendererToolRequests.delete(key);
    }
  }

  /**
   * 请求 renderer 执行本地工具。
   * @param input - 工具执行输入
   * @returns 工具执行结果
   */
  function executeRendererTool(input: ChatRuntimeRendererToolExecutionInput): Promise<AIToolExecutionResult> {
    if (!activeRuntimes.has(input.runtime.runtimeId)) {
      throw new ChatRuntimeError('RUNTIME_NOT_ACTIVE', `Runtime ${input.runtime.runtimeId} is not active`);
    }

    const key = createToolRequestKey(input.runtime.runtimeId, input.toolCallId);
    return new Promise<AIToolExecutionResult>((resolve, reject) => {
      pendingRendererToolRequests.set(key, { resolve, reject });
      emit('chat:runtime:tool-request', {
        runtimeId: input.runtime.runtimeId,
        sessionId: input.runtime.sessionId,
        clientId: input.runtime.clientId,
        agentId: input.runtime.agentId,
        parentRuntimeId: input.runtime.parentRuntimeId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        input: input.input
      });
    });
  }

  const streamExecutor = dependencies.streamExecutor ?? createDefaultStreamExecutor(executeRendererTool);

  /**
   * 完成 runtime 并释放 session 写入锁。
   * @param runtime - 需要完成的 runtime
   * @param usage - Provider 返回的 usage
   */
  function completeRuntime(runtime: ActiveChatRuntime, usage?: AIUsage): void {
    runtime.status = 'completed';
    activeRuntimes.delete(runtime.runtimeId);
    activeAssistantMessages.delete(runtime.runtimeId);
    rejectRuntimeToolRequests(runtime.runtimeId, 'Runtime completed');
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
  function emitContextUsageSnapshot(runtime: ActiveChatRuntime, sourceMessages: ChatMessageRecord[]): ChatRuntimeContextUsageSnapshot | undefined {
    if (runtime.contextWindow === undefined) return undefined;

    const modelMessages = toRuntimeModelMessages(sourceMessages);
    const snapshot = contextBudget.calculate({
      runtimeId: runtime.runtimeId,
      sessionId: runtime.sessionId,
      agentId: runtime.agentId,
      contextWindow: runtime.contextWindow,
      estimatedInputTokens: estimateSerializedModelMessages(modelMessages)
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

    const result = await compactionService.compact({
      runtimeId: runtime.runtimeId,
      sessionId: runtime.sessionId,
      clientId: runtime.clientId,
      agentId: runtime.agentId,
      parentRuntimeId: runtime.parentRuntimeId,
      reason: 'auto',
      contextWindow: runtime.contextWindow,
      messages: sourceMessages,
      signal: runtime.abortController.signal
    });
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
      const initialSourceMessages = sourceMessageSnapshot ?? (await readRuntimeSourceMessages(runtime, userMessage, assistantMessage));
      let sourceMessages = sourceMessageSnapshot ?? (await compactBeforeStreamIfNeeded(runtime, initialSourceMessages, userMessage, assistantMessage));
      if (sourceMessageSnapshot) emitContextUsageSnapshot(runtime, sourceMessageSnapshot);
      let streamResult = await streamExecutor({ runtime, sourceMessages, userMessage, assistantMessage }, (message) =>
        updateAssistantMessage(runtime, message)
      );
      if (!activeRuntimes.has(runtime.runtimeId)) return;

      let accumulatedUsage = addRuntimeUsage(undefined, streamResult.usage);
      let continuationRound = 0;
      while (streamResult.shouldContinue && continuationRound < MAX_RUNTIME_CONTINUATION_ROUNDS) {
        continuationRound += 1;
        sourceMessages = createContinuationSourceMessages(sourceMessages, assistantMessage);
        // eslint-disable-next-line no-await-in-loop
        streamResult = await streamExecutor({ runtime, sourceMessages, userMessage, assistantMessage }, (message) => updateAssistantMessage(runtime, message));
        if (!activeRuntimes.has(runtime.runtimeId)) return;
        accumulatedUsage = addRuntimeUsage(accumulatedUsage, streamResult.usage);
      }

      if (accumulatedUsage && !isSameRuntimeUsage(assistantMessage.usage, accumulatedUsage)) {
        assistantMessage.usage = accumulatedUsage;
        await updateAssistantMessage(runtime, assistantMessage);
      }
      completeRuntime(runtime, accumulatedUsage);
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
      const runtimeId = `runtime-${nanoid()}`;
      const lock = locks.acquireWritingLock({ sessionId, runtimeId });

      if (!lock.ok) {
        throw new ChatRuntimeError('SESSION_BUSY', `Session ${sessionId} is already running ${lock.ownerRuntimeId}`);
      }

      const runtime: ActiveChatRuntime = {
        runtimeId,
        sessionId,
        clientId: input.clientId,
        agentId: input.agentId,
        parentRuntimeId: input.parentRuntimeId,
        contextWindow: input.contextWindow,
        system: input.system,
        tools: input.tools,
        tavily: input.tavily,
        mcp: input.mcp,
        status: 'running',
        abortController: new AbortController(),
        createdAt: Date.now()
      };
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
        rejectRuntimeToolRequests(runtime.runtimeId, 'Runtime start failed');
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
      const assistantMessage = findLastRuntimeAssistantMessage(continuationMessages);
      if (!userMessage || !assistantMessage) {
        locks.releaseWritingLock({ sessionId: input.sessionId, runtimeId });
        throw new ChatRuntimeError('INVALID_CONTINUATION', 'Continuation requires user and assistant messages');
      }

      const runtime = createContinuationRuntime(input, runtimeId);
      activeRuntimes.set(runtimeId, runtime);
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
        rejectRuntimeToolRequests(runtime.runtimeId, 'Runtime continue failed');
        locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
        throw error;
      }

      return { runtimeId, sessionId: runtime.sessionId };
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
      rejectRuntimeToolRequests(runtime.runtimeId, 'Runtime aborted');
      locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
      await streamAbort(runtime.runtimeId);

      if (!assistantMessage) return;

      if (!hasAssistantResponseContent(assistantMessage)) {
        await messageWriter.deleteMessage?.(assistantMessage.sessionId, assistantMessage.id);
        emit('chat:runtime:message-deleted', {
          runtimeId: runtime.runtimeId,
          sessionId: runtime.sessionId,
          clientId: runtime.clientId,
          agentId: runtime.agentId,
          parentRuntimeId: runtime.parentRuntimeId,
          messageId: assistantMessage.id
        });
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
      const runtime: ActiveChatRuntime = {
        runtimeId: input.runtimeId,
        sessionId: input.sessionId,
        clientId: input.clientId,
        agentId: input.agentId,
        parentRuntimeId: input.parentRuntimeId,
        contextWindow: input.contextWindow,
        status: 'running',
        abortController: new AbortController(),
        createdAt: Date.now()
      };
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
      const key = createToolRequestKey(input.runtimeId, input.toolCallId);
      const pendingRequest = pendingRendererToolRequests.get(key);
      if (!pendingRequest) return;

      pendingRendererToolRequests.delete(key);
      pendingRequest.resolve(input.result);
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

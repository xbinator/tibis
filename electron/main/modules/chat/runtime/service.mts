/**
 * @file service.mts
 * @description 主进程 ChatRuntime 服务骨架。
 */
import type { RuntimeCompactionService } from './compaction.mjs';
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
import type { AIServiceError, AIToolExecutionCancelledResult, AIToolExecutionResult, AIUsage } from 'types/ai';
import type { AIUserChoiceAnswerData, ChatMessageFile, ChatMessageRecord, ChatMessageToolPart } from 'types/chat';
import type {
  ChatRuntimeAbortInput,
  ChatRuntimeAutoNameInput,
  ChatRuntimeAutoNameResult,
  ChatRuntimeBridgeResponseInput,
  ChatRuntimeBridgeResult,
  ChatRuntimeCompactInput,
  ChatRuntimeCompactResult,
  ChatRuntimeConfirmationDecision,
  ChatRuntimeConfirmationRequest,
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
import { createDefaultChatModelResolver } from './chat-model-resolver.mjs';
import { createRuntimeCompactionService } from './compaction.mjs';
import { createRuntimeCompressionExecutor } from './compression-executor.mjs';
import { createContextBudgetService } from './context-budget.mjs';
import { estimateSerializedModelMessages } from './context-estimator.mjs';
import { createRuntimeLockRegistry } from './locks.mjs';
import { toRuntimeModelMessages } from './model-message-context.mjs';
import { createRuntimeStreamExecutor } from './stream-executor.mjs';
import { createRuntimeStructuredSummaryGenerator, createRuntimeSummaryInvoke } from './structured-summary-generator.mjs';
import { createMainToolExecutor } from './tools/index.mjs';

/** 单个 runtime 内工具续轮最大次数。 */
const MAX_RUNTIME_CONTINUATION_ROUNDS = 25;

/** Renderer 请求默认超时时间。 */
const RUNTIME_RENDERER_REQUEST_TIMEOUT_MS = 30_000;

/** Provider 上下文超限错误文案模式。 */
const CONTEXT_OVERFLOW_MESSAGE_PATTERNS = [
  /\b413\b/i,
  /context[_\s-]*length[_\s-]*exceeded/i,
  /maximum context length/i,
  /context window/i,
  /prompt is too long/i,
  /input is too long/i,
  /too many tokens/i,
  /exceed(?:ed|s)?.{0,32}(?:context|token)/i,
  /context.{0,32}(?:overflow|exceed|too long)/i
];

/** Tool output prune 至少保护的最近用户轮数。 */
const TOOL_OUTPUT_PRUNE_PROTECTED_USER_TURNS = 2;

/** 超过该 JSON 长度的旧 tool result 会被软剪枝。 */
const TOOL_OUTPUT_PRUNE_MIN_JSON_LENGTH = 4_000;

/** 剪枝摘要最大长度。 */
const TOOL_OUTPUT_PRUNE_SUMMARY_LENGTH = 500;

/** 不参与 tool output prune 的工具。 */
const TOOL_OUTPUT_PRUNE_PROTECTED_TOOL_NAMES = new Set(['skill', 'ask_user_choice', 'ask_user_question', 'question']);

/** 会暂停并等待用户选择的工具名称。 */
const USER_CHOICE_TOOL_NAMES = new Set(['ask_user_choice', 'ask_user_question', 'question']);

/** 剪枝后保留的工具结果字段。 */
const TOOL_OUTPUT_PRUNE_PRESERVED_DATA_KEYS = [
  'path',
  'filePath',
  'url',
  'title',
  'totalLines',
  'readLines',
  'returnedCount',
  'count',
  'status',
  'summary',
  'message'
];

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
  /** 请求超时定时器。 */
  timeoutId: ReturnType<typeof setTimeout>;
}

/** 等待 renderer 回传的确认请求。 */
interface PendingRuntimeConfirmationRequest {
  /** 完成确认请求。 */
  resolve: (decision: ChatRuntimeConfirmationDecision) => void;
  /** 拒绝确认请求。 */
  reject: (error: Error) => void;
  /** 请求超时定时器。 */
  timeoutId: ReturnType<typeof setTimeout>;
}

/** 等待 renderer 回传的通用 bridge 请求。 */
interface PendingRuntimeBridgeRequest {
  /** 完成 bridge 请求。 */
  resolve: (result: ChatRuntimeBridgeResult) => void;
  /** 拒绝 bridge 请求。 */
  reject: (error: Error) => void;
  /** 请求超时定时器。 */
  timeoutId: ReturnType<typeof setTimeout>;
}

/** Runtime 确认请求输入。 */
interface ChatRuntimeRequestConfirmationInput {
  /** Runtime id。 */
  runtimeId: string;
  /** 关联工具调用 ID。 */
  toolCallId?: string;
  /** 确认请求 id，缺省时自动生成。 */
  confirmationId?: string;
  /** 确认请求详情。 */
  request: ChatRuntimeConfirmationRequest;
}

/** Runtime bridge 请求输入。 */
interface ChatRuntimeRequestBridgeInput {
  /** Runtime id。 */
  runtimeId: string;
  /** Bridge 请求 id，缺省时自动生成。 */
  requestId?: string;
  /** 关联工具调用 ID。 */
  toolCallId?: string;
  /** Bridge 请求类型。 */
  kind: string;
  /** Bridge 请求载荷。 */
  payload?: unknown;
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
    workspaceRoot: input.workspaceRoot,
    tools: input.tools,
    tavily: input.tavily,
    mcp: input.mcp,
    status: 'running',
    abortController: new AbortController(),
    createdAt: Date.now()
  };
}

/**
 * 根据用户选择输入创建续轮 runtime 状态。
 * @param input - 用户选择提交输入
 * @param runtimeId - runtime id
 * @returns runtime 状态
 */
function createUserChoiceRuntime(input: ChatRuntimeSubmitUserChoiceInput, runtimeId: string): ActiveChatRuntime {
  return {
    runtimeId,
    sessionId: input.sessionId,
    clientId: input.clientId,
    agentId: input.agentId,
    parentRuntimeId: input.parentRuntimeId,
    contextWindow: input.contextWindow,
    system: input.system,
    workspaceRoot: input.workspaceRoot,
    tools: input.tools,
    tavily: input.tavily,
    mcp: input.mcp,
    status: 'running',
    abortController: new AbortController(),
    createdAt: Date.now()
  };
}

/**
 * 浅克隆消息与 part，便于安全替换 tool result。
 * @param message - 原始消息
 * @returns 克隆后的消息
 */
function cloneRuntimeMessage(message: ChatMessageRecord): ChatMessageRecord {
  return {
    ...message,
    parts: message.parts.map((part) => ({ ...part }))
  };
}

/**
 * 判断 tool part 是否正在等待用户选择。
 * @param part - 消息片段
 * @param answer - 用户选择答案
 * @returns 是否匹配待提交问题
 */
function isMatchingAwaitingUserChoicePart(part: ChatMessageRecord['parts'][number], answer: AIUserChoiceAnswerData): part is ChatMessageToolPart {
  return (
    part.type === 'tool' &&
    USER_CHOICE_TOOL_NAMES.has(part.toolName) &&
    part.toolCallId === answer.toolCallId &&
    part.result?.status === 'awaiting_user_input' &&
    part.result.data.questionId === answer.questionId
  );
}

/**
 * 判断用户选择答案是否表示取消。
 * @param answer - 用户选择答案
 * @returns 是否取消
 */
function isCancelledUserChoiceAnswer(answer: AIUserChoiceAnswerData): boolean {
  const questionAnswers = answer.questionAnswers ?? [];
  return answer.answers.length === 0 && (answer.otherText ?? '') === '' && questionAnswers.every((item) => item.answers.length === 0);
}

/**
 * 将用户选择答案写入待回答的 assistant tool part。
 * @param messages - 会话消息
 * @param answer - 用户选择答案
 * @returns 被更新的 assistant 消息
 */
function applyUserChoiceAnswer(messages: ChatMessageRecord[], answer: AIUserChoiceAnswerData): ChatMessageRecord | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const resultPart = message.parts.find((part) => isMatchingAwaitingUserChoicePart(part, answer));
    if (!resultPart) continue;

    resultPart.result = isCancelledUserChoiceAnswer(answer)
      ? { toolName: resultPart.toolName, status: 'cancelled', error: { code: 'USER_CANCELLED', message: '用户取消了选择' } }
      : { toolName: resultPart.toolName, status: 'success', data: answer };
    return message;
  }

  return undefined;
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
 * 判断错误是否为 provider 上下文超限。
 * @param error - runtime 错误
 * @returns 是否可触发 overflow replay
 */
function isContextOverflowError(error: AIServiceError): boolean {
  return CONTEXT_OVERFLOW_MESSAGE_PATTERNS.some((pattern) => pattern.test(error.message));
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
 * 创建附件降级占位文本。
 * @param file - 消息附件
 * @returns 占位文本
 */
function createAttachmentPlaceholder(file: ChatMessageFile): string {
  return `[Attached ${file.mimeType ?? file.type}: ${file.name}]`;
}

/**
 * 移除会被模型当作媒体输入发送的远程地址。
 * @param file - 消息附件
 * @returns 降级后的附件
 */
function removeModelMediaUrl(file: ChatMessageFile): ChatMessageFile {
  const downgradedFile = { ...file };
  delete downgradedFile.url;
  return downgradedFile;
}

/**
 * 为 overflow replay 降级当前用户消息中的媒体附件。
 * @param message - 当前用户消息
 * @returns 降级后的用户消息
 */
function downgradeUserMessageForOverflowReplay(message: ChatMessageRecord): ChatMessageRecord {
  if (!message.files?.length) return message;

  const content = [message.content.trim(), ...message.files.map(createAttachmentPlaceholder)].filter((item) => item.length > 0).join('\n');
  return {
    ...message,
    content,
    parts: content ? [{ type: 'text', text: content }] : [],
    files: message.files.map(removeModelMediaUrl)
  };
}

/**
 * 降级 replay 源消息中的当前用户消息。
 * @param sourceMessages - 原始源消息
 * @param userMessage - 当前用户消息
 * @returns 降级后的源消息
 */
function downgradeOverflowReplaySourceMessages(sourceMessages: ChatMessageRecord[], userMessage: ChatMessageRecord): ChatMessageRecord[] {
  return sourceMessages.map((message) => (message.id === userMessage.id ? downgradeUserMessageForOverflowReplay(message) : message));
}

/**
 * 安全序列化 JSON。
 * @param value - 待序列化值
 * @returns JSON 字符串
 */
function safeStringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 查找 tool output prune 的保护区起点。
 * @param messages - 完整消息列表
 * @returns 最近用户轮保护区起点
 */
function findToolOutputPruneProtectedStartIndex(messages: ChatMessageRecord[]): number {
  let seenUserTurns = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role !== 'user') continue;

    seenUserTurns += 1;
    if (seenUserTurns >= TOOL_OUTPUT_PRUNE_PROTECTED_USER_TURNS) return index;
  }

  return 0;
}

/**
 * 判断工具结果是否可剪枝。
 * @param part - 工具片段
 * @returns 是否可剪枝
 */
function shouldPruneToolResult(part: ChatMessageToolPart): boolean {
  if (part.status !== 'done' || part.result?.status !== 'success') return false;
  if (TOOL_OUTPUT_PRUNE_PROTECTED_TOOL_NAMES.has(part.toolName)) return false;

  return safeStringifyJson(part.result.data).length > TOOL_OUTPUT_PRUNE_MIN_JSON_LENGTH;
}

/**
 * 提取剪枝后仍应保留的工具结果字段。
 * @param data - 原始工具结果数据
 * @returns 可保留字段
 */
function pickPrunedToolResultFields(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};

  const source = data as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of TOOL_OUTPUT_PRUNE_PRESERVED_DATA_KEYS) {
    const value = source[key];
    if (value === undefined) continue;
    picked[key] =
      typeof value === 'string' && value.length > TOOL_OUTPUT_PRUNE_SUMMARY_LENGTH ? `${value.slice(0, TOOL_OUTPUT_PRUNE_SUMMARY_LENGTH)}...` : value;
  }

  return picked;
}

/**
 * 创建剪枝后的工具结果摘要数据。
 * @param data - 原始工具结果数据
 * @param serializedData - 原始序列化数据
 * @returns 剪枝摘要数据
 */
function createPrunedToolResultData(data: unknown, serializedData: string): Record<string, unknown> {
  const preservedFields = pickPrunedToolResultFields(data);
  const fallbackSummary = serializedData.slice(0, TOOL_OUTPUT_PRUNE_SUMMARY_LENGTH);
  const summary =
    typeof preservedFields.summary === 'string' && preservedFields.summary.trim()
      ? preservedFields.summary
      : `Large tool result pruned. Preview: ${fallbackSummary}`;

  return {
    ...preservedFields,
    pruned: true,
    summary,
    originalBytes: serializedData.length
  };
}

/**
 * 剪枝单个工具片段。
 * @param part - 工具片段
 * @returns 剪枝后的工具片段，未剪枝时返回原片段
 */
function pruneToolPartIfNeeded(part: ChatMessageToolPart): ChatMessageToolPart {
  if (!shouldPruneToolResult(part) || part.result?.status !== 'success') return part;

  const serializedData = safeStringifyJson(part.result.data);
  return {
    ...part,
    result: {
      ...part.result,
      data: createPrunedToolResultData(part.result.data, serializedData)
    }
  };
}

/**
 * 剪枝单条消息中的旧 tool output。
 * @param message - 消息
 * @returns 剪枝后的消息，无需更新时返回 undefined
 */
function pruneMessageToolOutputs(message: ChatMessageRecord): ChatMessageRecord | undefined {
  if (message.role !== 'assistant') return undefined;

  let changed = false;
  const parts = message.parts.map((part) => {
    if (part.type !== 'tool') return part;

    const nextPart = pruneToolPartIfNeeded(part);
    if (nextPart !== part) changed = true;
    return nextPart;
  });
  if (!changed) return undefined;

  return { ...message, parts };
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
  const pendingConfirmationRequests = new Map<string, PendingRuntimeConfirmationRequest>();
  const pendingBridgeRequests = new Map<string, PendingRuntimeBridgeRequest>();
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
   * 创建确认请求 key。
   * @param runtimeId - runtime id
   * @param confirmationId - 确认请求 id
   * @returns pending key
   */
  function createConfirmationRequestKey(runtimeId: string, confirmationId: string): string {
    return `${runtimeId}:${confirmationId}`;
  }

  /**
   * 创建 bridge 请求 key。
   * @param runtimeId - runtime id
   * @param requestId - bridge 请求 id
   * @returns pending key
   */
  function createBridgeRequestKey(runtimeId: string, requestId: string): string {
    return `${runtimeId}:${requestId}`;
  }

  /**
   * 拒绝指定 runtime 所有等待中的工具请求。
   * @param runtimeId - runtime id
   * @param reason - 拒绝原因
   */
  function rejectRuntimeToolRequests(runtimeId: string, reason: string): void {
    for (const [key, request] of pendingRendererToolRequests) {
      if (!key.startsWith(`${runtimeId}:`)) continue;

      clearTimeout(request.timeoutId);
      request.reject(new ChatRuntimeError('TOOL_REQUEST_CANCELLED', reason));
      pendingRendererToolRequests.delete(key);
    }
  }

  /**
   * 拒绝指定 runtime 所有等待中的确认请求。
   * @param runtimeId - runtime id
   * @param reason - 拒绝原因
   */
  function rejectRuntimeConfirmationRequests(runtimeId: string, reason: string): void {
    for (const [key, request] of pendingConfirmationRequests) {
      if (!key.startsWith(`${runtimeId}:`)) continue;

      clearTimeout(request.timeoutId);
      request.reject(new ChatRuntimeError('CONFIRMATION_DISMISSED', reason));
      pendingConfirmationRequests.delete(key);
    }
  }

  /**
   * 请求 renderer 展示确认弹窗并等待决策。
   * @param input - 确认请求输入
   * @returns renderer 确认决策
   */
  function requestRuntimeConfirmation(input: ChatRuntimeRequestConfirmationInput): Promise<ChatRuntimeConfirmationDecision> {
    const runtime = activeRuntimes.get(input.runtimeId);
    if (!runtime) {
      throw new ChatRuntimeError('RUNTIME_NOT_ACTIVE', `Runtime ${input.runtimeId} is not active`);
    }

    const confirmationId = input.confirmationId ?? `confirmation-${nanoid()}`;
    const key = createConfirmationRequestKey(input.runtimeId, confirmationId);
    return new Promise<ChatRuntimeConfirmationDecision>((resolve, reject) => {
      const timeoutId = setTimeout((): void => {
        pendingConfirmationRequests.delete(key);
        resolve({ approved: false });
      }, RUNTIME_RENDERER_REQUEST_TIMEOUT_MS);
      pendingConfirmationRequests.set(key, { resolve, reject, timeoutId });
      emit('chat:runtime:confirmation-requested', {
        runtimeId: runtime.runtimeId,
        sessionId: runtime.sessionId,
        clientId: runtime.clientId,
        agentId: runtime.agentId,
        parentRuntimeId: runtime.parentRuntimeId,
        confirmationId,
        toolCallId: input.toolCallId,
        request: input.request
      });
    });
  }

  /**
   * 拒绝指定 runtime 所有等待中的 bridge 请求。
   * @param runtimeId - runtime id
   * @param reason - 拒绝原因
   */
  function rejectRuntimeBridgeRequests(runtimeId: string, reason: string): void {
    for (const [key, request] of pendingBridgeRequests) {
      if (!key.startsWith(`${runtimeId}:`)) continue;

      clearTimeout(request.timeoutId);
      request.reject(new ChatRuntimeError('EDITOR_UNAVAILABLE', reason));
      pendingBridgeRequests.delete(key);
    }
  }

  /**
   * 请求 renderer 执行通用 bridge 操作并等待结果。
   * @param input - bridge 请求输入
   * @returns renderer bridge 结果
   */
  function requestRuntimeBridge(input: ChatRuntimeRequestBridgeInput): Promise<ChatRuntimeBridgeResult> {
    const runtime = activeRuntimes.get(input.runtimeId);
    if (!runtime) {
      throw new ChatRuntimeError('RUNTIME_NOT_ACTIVE', `Runtime ${input.runtimeId} is not active`);
    }

    const requestId = input.requestId ?? `bridge-${nanoid()}`;
    const key = createBridgeRequestKey(input.runtimeId, requestId);
    return new Promise<ChatRuntimeBridgeResult>((resolve, reject) => {
      const timeoutId = setTimeout((): void => {
        pendingBridgeRequests.delete(key);
        resolve({
          status: 'failure',
          error: { code: 'TOOL_TIMEOUT', message: 'Renderer bridge request timed out' }
        });
      }, RUNTIME_RENDERER_REQUEST_TIMEOUT_MS);
      pendingBridgeRequests.set(key, { resolve, reject, timeoutId });
      emit('chat:runtime:bridge-requested', {
        runtimeId: runtime.runtimeId,
        sessionId: runtime.sessionId,
        clientId: runtime.clientId,
        agentId: runtime.agentId,
        parentRuntimeId: runtime.parentRuntimeId,
        requestId,
        toolCallId: input.toolCallId,
        kind: input.kind,
        payload: input.payload
      });
    });
  }

  const executeMainTool = createMainToolExecutor({
    now,
    requestBridge: requestRuntimeBridge,
    requestConfirmation: requestRuntimeConfirmation
  });

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
      const timeoutId = setTimeout((): void => {
        pendingRendererToolRequests.delete(key);
        resolve({
          toolName: input.toolName,
          status: 'failure',
          error: { code: 'TOOL_TIMEOUT', message: 'Renderer tool request timed out' }
        });
      }, RUNTIME_RENDERER_REQUEST_TIMEOUT_MS);
      pendingRendererToolRequests.set(key, { resolve, reject, timeoutId });
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

  const streamExecutor = dependencies.streamExecutor ?? createDefaultStreamExecutor(executeRendererTool, executeMainTool, rendererToolTimeoutMs);

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
    rejectRuntimeConfirmationRequests(runtime.runtimeId, 'Runtime completed');
    rejectRuntimeBridgeRequests(runtime.runtimeId, 'Runtime completed');
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

    await compactionService.compact({
      runtimeId: runtime.runtimeId,
      sessionId: runtime.sessionId,
      clientId: runtime.clientId,
      agentId: runtime.agentId,
      parentRuntimeId: runtime.parentRuntimeId,
      reason: 'auto',
      contextWindow: runtime.contextWindow,
      messages: completedMessages,
      signal: runtime.abortController.signal
    });
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

    const compactResult = await compactionService.compact({
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

      const runtime: ActiveChatRuntime = {
        runtimeId,
        sessionId,
        clientId: input.clientId,
        agentId: input.agentId,
        parentRuntimeId: input.parentRuntimeId,
        contextWindow: input.contextWindow,
        system: input.system,
        workspaceRoot: input.workspaceRoot,
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
        rejectRuntimeConfirmationRequests(runtime.runtimeId, 'Runtime start failed');
        rejectRuntimeBridgeRequests(runtime.runtimeId, 'Runtime start failed');
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
        rejectRuntimeConfirmationRequests(runtime.runtimeId, 'Runtime continue failed');
        rejectRuntimeBridgeRequests(runtime.runtimeId, 'Runtime continue failed');
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
        rejectRuntimeToolRequests(runtime.runtimeId, 'Runtime user choice submit failed');
        rejectRuntimeConfirmationRequests(runtime.runtimeId, 'Runtime user choice submit failed');
        rejectRuntimeBridgeRequests(runtime.runtimeId, 'Runtime user choice submit failed');
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
    requestConfirmation(input: ChatRuntimeRequestConfirmationInput): Promise<ChatRuntimeConfirmationDecision> {
      return requestRuntimeConfirmation(input);
    },

    /**
     * 提交 renderer 确认决策。
     * @param input - 确认决策输入
     */
    submitConfirmation(input: ChatRuntimeSubmitConfirmationInput): void {
      const key = createConfirmationRequestKey(input.runtimeId, input.confirmationId);
      const pendingRequest = pendingConfirmationRequests.get(key);
      if (!pendingRequest) return;

      pendingConfirmationRequests.delete(key);
      clearTimeout(pendingRequest.timeoutId);
      pendingRequest.resolve(input.decision);
    },

    /**
     * 请求 renderer 执行通用 bridge 操作并等待结果。
     * @param input - bridge 请求输入
     * @returns renderer bridge 结果
     */
    requestBridge(input: ChatRuntimeRequestBridgeInput): Promise<ChatRuntimeBridgeResult> {
      return requestRuntimeBridge(input);
    },

    /**
     * 提交 renderer bridge 响应。
     * @param input - bridge 响应输入
     */
    submitBridgeResponse(input: ChatRuntimeBridgeResponseInput): void {
      const key = createBridgeRequestKey(input.runtimeId, input.requestId);
      const pendingRequest = pendingBridgeRequests.get(key);
      if (!pendingRequest) return;

      pendingBridgeRequests.delete(key);
      clearTimeout(pendingRequest.timeoutId);
      pendingRequest.resolve(input.result);
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
      rejectRuntimeConfirmationRequests(runtime.runtimeId, 'Runtime aborted');
      rejectRuntimeBridgeRequests(runtime.runtimeId, 'Runtime aborted');
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
      clearTimeout(pendingRequest.timeoutId);
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

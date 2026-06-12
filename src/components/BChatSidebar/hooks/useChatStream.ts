/* eslint-disable no-use-before-define */
/**
 * @file useChatStream.ts
 * @description 聊天消息流式处理 hook，处理 AI 流式输出、工具调用和循环保护
 */
import type { CachedModelMessagesResult } from '../utils/messageHelper';
import type { Message, ServiceConfig, ToolLoopGuardConfig } from '../utils/types';
import type { ModelMessage } from 'ai';
import type {
  AIMCPRequestConfig,
  AIToolExecutor,
  AIToolContext,
  AIServiceError,
  AIStreamFinishChunk,
  AIStreamFinishReason,
  AIStreamToolCallChunk,
  AIStreamToolInputDeltaChunk,
  AIStreamToolInputEndChunk,
  AIStreamToolInputStartChunk,
  AIStreamToolResultChunk
} from 'types/ai';
import type { AIUserChoiceAnswerData, ChatMessageConfirmationAction } from 'types/chat';
import { nextTick, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue';
import { parsePartialJson } from 'ai';
import dayjs from 'dayjs';
import { isSdkManagedToolName } from '@/ai/tools/builtin';
import { getModelToolSupport } from '@/ai/tools/policy';
import { executeToolCall, toTransportTools, type ExecutedToolCall } from '@/ai/tools/stream';
import { useChat } from '@/hooks/useChat';
import { native } from '@/shared/platform';
import { useMemoryStore } from '@/stores/ai/memory';
import { useServiceModelStore } from '@/stores/ai/serviceModel';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';
import { buildChatMessageReferences } from '../utils/fileReferenceContext';
import { append, convert, create, userChoice, is, finalizeToolPartsAsCancelled } from '../utils/messageHelper';
import { createToolCallTracker, type ToolCallTracker } from '../utils/toolCallTracker';
import { createToolLoopGuard, type ToolLoopGuard } from '../utils/toolLoopGuard';

export interface UseChatStreamOptions {
  /** 消息列表（响应式引用） */
  messages: Ref<Message[]>;
  /** 可用 AI 工具，支持静态数组或动态获取函数 */
  tools?: AIToolExecutor[] | (() => AIToolExecutor[]);
  /** 获取工具上下文 */
  getToolContext?: () => AIToolContext | undefined;
  /** 获取会话 ID */
  getSessionId?: () => string | undefined;
  /** 重新生成前回调 */
  onBeforeRegenerate?: (messages: Message[], triggerMessage: Message) => Promise<void> | void;
  /** 消息完成回调 */
  onComplete?: (message: Message) => Promise<void> | void;
  /** 确认卡片操作回调 */
  onConfirmationAction?: (confirmationId: string, action: ChatMessageConfirmationAction) => void | Promise<void>;
}

export interface UseChatStreamReturns {
  /** 加载状态 */
  loading: Ref<boolean>;
  // 流式处理相关函数
  stream: {
    /** 解析服务配置 */
    resolveServiceConfig: () => Promise<ServiceConfig | undefined>;
    /** 追加文本片段 */
    appendText: (content: string) => void;
    /** 追加思考片段 */
    appendThinking: (thinking: string) => void;
    /** 追加工具调用 */
    appendToolCall: (chunk: AIStreamToolCallChunk) => void;
    /** 准备助手消息占位符 */
    prepareAssistantMessage: (reuseLastAssistant: boolean) => Message | undefined;
    /** 流式传输消息 */
    streamMessages: (sourceMessages: Message[], config: ServiceConfig, reuseLastAssistant?: boolean) => Promise<void>;
    /** 中止流式传输，等待助手消息持久化完成 */
    abort: () => Promise<void>;
    /** 用户选择提交 */
    submitUserChoice: (answer: AIUserChoiceAnswerData) => Promise<boolean>;
    /** 重新生成 */
    regenerate: (message: Message) => Promise<boolean>;
  };
}

const DEFAULT_TOOL_LOOP_GUARD_CONFIG: ToolLoopGuardConfig = {
  maxRounds: 25,
  maxRepeatedCalls: 2
};

/**
 * 由主进程 AI SDK 直接执行的远端工具名称。
 * 这些工具会在主进程内完成调用并继续同一轮流式输出，前端不应再次尝试本地执行。
 */
export function useChatStream(options: UseChatStreamOptions): UseChatStreamReturns {
  const { messages, tools: toolsInput, getToolContext, onBeforeRegenerate, onComplete } = options;

  /**
   * 解析当前可用的工具列表。
   * 支持静态数组或动态 getter 函数，每次调用时取最新值。
   * @returns 工具执行器数组
   */
  function resolveTools(): AIToolExecutor[] {
    return typeof toolsInput === 'function' ? toolsInput() : toolsInput ?? [];
  }

  const loading = ref(false);
  const pendingToolResults = shallowRef<ExecutedToolCall[]>([]);
  const blockedToolLoopReason = ref('');
  const awaitingUserChoice = ref(false);
  const aborting = ref(false);
  const activeTaskType = ref<'chat' | null>(null);

  const serviceModelStore = useServiceModelStore();
  const toolSettingsStore = useToolSettingsStore();

  let lastServiceConfig: ServiceConfig | null = null;
  let executedToolCallIds = new Set<string>();
  let currentToolRoundId = 0;
  let currentToolCallTracker: ToolCallTracker = createToolCallTracker();
  let currentToolLoopGuard: ToolLoopGuard = createToolLoopGuard(DEFAULT_TOOL_LOOP_GUARD_CONFIG);
  let currentModelMessageCache: CachedModelMessagesResult | undefined;
  let lastFinishReason: AIStreamFinishReason | null = null;

  /** 文本 token 缓冲，用于 rAF 帧级合并 */
  let textBuffer = '';
  /** 文本 rAF 句柄 */
  let textFlushRaf: number | null = null;
  /** 思考 token 缓冲，用于 rAF 帧级合并 */
  let thinkingBuffer = '';
  /** 思考 rAF 句柄 */
  let thinkingFlushRaf: number | null = null;

  /**
   * 将累积的文本缓冲一次性刷新到消息。
   */
  function flushTextBuffer(): void {
    textFlushRaf = null;
    if (textBuffer) {
      const flushed = textBuffer;
      textBuffer = '';
      appendText(flushed);
    }
  }

  /**
   * 将累积的思考缓冲一次性刷新到消息。
   */
  function flushThinkingBuffer(): void {
    thinkingFlushRaf = null;
    if (thinkingBuffer) {
      const flushed = thinkingBuffer;
      thinkingBuffer = '';
      appendThinking(flushed);
    }
  }

  /**
   * 清空所有缓冲并取消待执行的 rAF。
   */
  function flushAllBuffers(): void {
    if (textFlushRaf !== null) {
      cancelAnimationFrame(textFlushRaf);
      textFlushRaf = null;
    }
    if (thinkingFlushRaf !== null) {
      cancelAnimationFrame(thinkingFlushRaf);
      thinkingFlushRaf = null;
    }
    flushTextBuffer();
    flushThinkingBuffer();
  }

  const { agent } = useChat({
    onText: async (content: string): Promise<void> => {
      textBuffer += content;
      if (textFlushRaf === null) {
        textFlushRaf = requestAnimationFrame(flushTextBuffer);
      }
    },
    onThinking: async (thinking: string): Promise<void> => {
      thinkingBuffer += thinking;
      if (thinkingFlushRaf === null) {
        thinkingFlushRaf = requestAnimationFrame(flushThinkingBuffer);
      }
    },
    onFinish: async ({ usage, finishReason }: AIStreamFinishChunk): Promise<void> => {
      const message = messages.value[messages.value.length - 1];
      lastFinishReason = finishReason;
      if (message) {
        message.usage = usage;
      }
    },
    onToolInputStart: handleAppendToolInputStart,
    onToolInputDelta: handleAppendToolInputDelta,
    onToolInputEnd: handleAppendToolInputEnd,
    onToolCall: handleAppendToolCall,
    onToolResult: handleAppendToolResult,
    onComplete: handleStreamComplete,
    onError: handleStreamError
  });

  // 流式完成（正常/异常/中止）时清空缓冲，确保所有内容被渲染
  watch(loading, (val) => {
    if (!val) {
      flushAllBuffers();
    }
  });

  const disposeShellCommandOutput = native.onShellCommandOutput((chunk) => {
    const message = messages.value[messages.value.length - 1];
    if (message?.role !== 'assistant') {
      return;
    }

    append.shellOutputPart(message, chunk.commandId, chunk);
  });
  onScopeDispose(() => {
    disposeShellCommandOutput();
    flushAllBuffers();
  });

  /**
   * 重置工具循环状态
   */
  function resetToolLoopState() {
    currentToolRoundId = 0;
    currentToolCallTracker = createToolCallTracker();
    blockedToolLoopReason.value = '';
    executedToolCallIds = new Set();
    pendingToolResults.value = [];
    awaitingUserChoice.value = false;
    lastServiceConfig = null;
    lastFinishReason = null;
  }

  /**
   * 开始工具循环会话
   */
  function startToolLoopSession() {
    resetToolLoopState();
    currentToolLoopGuard = createToolLoopGuard(DEFAULT_TOOL_LOOP_GUARD_CONFIG);
  }

  /**
   * 移除尾部空助手消息
   */
  function removeTrailingEmptyAssistantMessage() {
    const lastMessage = messages.value[messages.value.length - 1];
    if (is.removableAssistantPlaceholder(lastMessage)) {
      messages.value.pop();
    }
  }

  /**
   * 收尾当前助手消息，供主动中止等非正常完成场景复用
   */
  function finalizeCurrentAssistantMessage(): Message | undefined {
    const lastMessage = messages.value[messages.value.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') {
      return undefined;
    }

    if (is.removableAssistantPlaceholder(lastMessage)) {
      messages.value.pop();
      return undefined;
    }

    lastMessage.loading = false;
    lastMessage.finished = true;
    lastMessage.createdAt ||= dayjs().toISOString();
    return lastMessage;
  }

  /**
   * 追加助手工具调用片段
   */
  function appendAssistantToolCall(chunk: AIStreamToolCallChunk) {
    const message = messages.value[messages.value.length - 1];
    if (message?.role !== 'assistant') {
      return;
    }

    append.toolCallPart(message, chunk.toolCallId, chunk.toolName, chunk.input);
  }

  /**
   * 追加助手工具输入预览片段。
   */
  function appendAssistantToolInputStart(chunk: AIStreamToolInputStartChunk): void {
    const message = messages.value[messages.value.length - 1];
    if (message?.role !== 'assistant') {
      return;
    }

    append.toolInputStartPart(message, chunk.toolCallId, chunk.toolName);
    message.createdAt ||= dayjs().toISOString();
  }

  /**
   * 追加助手工具输入增量片段。
   */
  async function appendAssistantToolInputDelta(chunk: AIStreamToolInputDeltaChunk): Promise<void> {
    const message = messages.value[messages.value.length - 1];
    if (message?.role !== 'assistant') {
      return;
    }

    const previewPart = message.parts.find(
      (part): part is Extract<Message['parts'][number], { type: 'tool' }> => part.type === 'tool' && part.toolCallId === chunk.toolCallId
    );
    const nextInputText = `${previewPart?.inputText ?? ''}${chunk.inputTextDelta}`;
    const parsed = await parsePartialJson(nextInputText);

    append.toolInputDeltaPart(message, chunk.toolCallId, chunk.inputTextDelta, parsed.value);
    message.createdAt ||= dayjs().toISOString();
  }

  /**
   * 处理助手工具输入结束片段。
   */
  function appendAssistantToolInputEnd(chunk: AIStreamToolInputEndChunk): void {
    const message = messages.value[messages.value.length - 1];
    if (message?.role !== 'assistant') {
      return;
    }

    const previewPart = message.parts.find((part) => part.type === 'tool' && part.toolCallId === chunk.toolCallId);
    if (!previewPart) {
      return;
    }

    message.createdAt ||= dayjs().toISOString();
  }

  /**
   * 追加助手工具结果片段
   */
  function appendAssistantToolResult(result: ExecutedToolCall) {
    const message = messages.value[messages.value.length - 1];
    if (message?.role !== 'assistant') {
      return;
    }

    append.toolResultPart(message, result.toolCallId, result.toolName, result.result);
  }

  /**
   * 追加主进程返回的远端工具结果片段。
   */
  function appendAssistantRemoteToolResult(chunk: AIStreamToolResultChunk) {
    const message = messages.value[messages.value.length - 1];
    if (message?.role !== 'assistant') {
      return;
    }

    append.toolResultPart(message, chunk.toolCallId, chunk.toolName, chunk.result);
  }

  /**
   * 将当前助手消息标记为“等待用户继续”的已暂停态。
   * 消息本身停止继续追加内容，但仍保持未完成状态，直到用户完成回答并续轮。
   */
  function finalizeAssistantMessageAwaitingUserChoice(): void {
    const message = messages.value[messages.value.length - 1];
    if (message?.role !== 'assistant') {
      return;
    }

    message.loading = false;
    message.finished = false;
    message.createdAt ||= dayjs().toISOString();
  }

  /**
   * 判断助手消息是否已经包含最终可见回答。
   */
  function hasVisibleAssistantAnswer(message: Message): boolean {
    return message.parts.some((part) => (part.type === 'text' && part.text.trim().length > 0) || part.type === 'error');
  }

  /**
   * 判断助手消息是否只停留在 Tavily 等远端工具阶段。
   */
  function hasSdkManagedToolResult(message: Message): boolean {
    return message.parts.some((part) => part.type === 'tool' && Boolean(part.result) && isSdkManagedToolName(part.toolName));
  }

  /**
   * 判断本轮是否应基于远端 SDK 工具结果自动续答。
   */
  function shouldContinueAfterSdkToolResult(message: Message): boolean {
    return lastFinishReason === 'tool-calls' && !hasVisibleAssistantAnswer(message) && hasSdkManagedToolResult(message);
  }

  /**
   * 为“工具执行完但模型没有继续回答”的静默结束场景追加提示。
   */
  function appendSilentSdkCompletionHint(message: Message): void {
    if (!shouldContinueAfterSdkToolResult(message)) {
      return;
    }

    const reasonText = lastFinishReason ? `（finishReason: ${lastFinishReason}）` : '';
    message.parts.push({
      type: 'error',
      text: `工具已执行，但模型没有生成最终回答，请重试。${reasonText}`
    });
    message.content ||= `工具已执行，但模型没有生成最终回答，请重试。${reasonText}`;
  }

  /**
   * 追加错误消息到消息列表
   * 如果最后一条消息不是 user，则将错误信息追加到该消息的 parts 中
   * 否则创建新的错误消息推入列表
   * @param reason - 错误原因
   * @returns 创建的错误消息
   */
  function mergeErrorMessage(reason: string): Message {
    const errorMessage = create.errorMessage(reason);
    const lastMessage = messages.value[messages.value.length - 1];

    if (lastMessage?.role !== 'user') {
      lastMessage.parts.push(...errorMessage.parts);
      lastMessage.content = lastMessage.content ? `${lastMessage.content}\n${reason}` : reason;
      lastMessage.loading = false;
      lastMessage.finished = true;
      lastMessage.createdAt ||= dayjs().toISOString();
      return lastMessage;
    }
    messages.value.push(errorMessage);
    return errorMessage;
  }

  /**
   * 停止工具循环
   * 当工具调用轮次或重复次数超过限制时触发
   * @param reason - 停止原因
   */
  async function stopToolLoop(reason: string): Promise<void> {
    blockedToolLoopReason.value = reason;
    pendingToolResults.value = [];
    removeTrailingEmptyAssistantMessage();

    const errorMessage = mergeErrorMessage(reason);
    await onComplete?.(errorMessage);
  }

  /**
   * 执行追踪的工具调用
   */
  async function executeTrackedToolCall(chunk: AIStreamToolCallChunk, roundId: number): Promise<void> {
    const result = await executeToolCall(chunk, resolveTools(), getToolContext?.());
    if (roundId !== currentToolRoundId) {
      return;
    }

    appendAssistantToolResult(result);

    if (result.result.status === 'awaiting_user_input') {
      awaitingUserChoice.value = true;
      finalizeAssistantMessageAwaitingUserChoice();
      return;
    }

    pendingToolResults.value = [...pendingToolResults.value, result];
  }

  /**
   * 处理工具调用
   */
  async function handleToolCall(chunk: AIStreamToolCallChunk): Promise<void> {
    if (executedToolCallIds.has(chunk.toolCallId)) {
      return;
    }

    executedToolCallIds.add(chunk.toolCallId);
    appendAssistantToolCall(chunk);

    // Tavily 等远端 SDK 工具由主进程直接执行，前端仅展示 tool-call，不再本地回放执行。
    if (!resolveTools().some((item) => item.definition.name === chunk.toolName) && isSdkManagedToolName(chunk.toolName)) {
      return;
    }

    const guardResult = currentToolLoopGuard.recordToolCall(chunk.toolName, chunk.input);
    if (!guardResult.allowed) {
      await stopToolLoop(guardResult.reason ?? '工具调用重复次数超过限制，已停止自动续轮。');
      return;
    }

    const trackedTask = currentToolCallTracker.track(executeTrackedToolCall(chunk, currentToolRoundId));
    await trackedTask;
  }

  /**
   * 解析服务配置
   */
  async function resolveServiceConfig() {
    let config = await serviceModelStore.getAvailableServiceConfig('chat');
    if (!config?.providerId || !config?.modelId) {
      config = await serviceModelStore.getAvailableServiceConfig('chat');
    }
    if (!config?.providerId || !config?.modelId) {
      return undefined;
    }

    const toolSupport = await getModelToolSupport(config.providerId, config.modelId);
    return { providerId: config.providerId, modelId: config.modelId, toolSupport };
  }

  /**
   * 追加文本片段
   */
  function appendText(content: string) {
    const message = messages.value[messages.value.length - 1];
    if (!message) return;

    append.textPart(message, content);
    message.loading = false;
    message.createdAt ||= dayjs().toISOString();
  }

  /**
   * 追加思考片段
   */
  function appendThinking(thinking: string) {
    const message = messages.value[messages.value.length - 1];
    if (!message) return;

    append.thinkingPart(message, thinking);
    message.loading = false;
    message.createdAt ||= dayjs().toISOString();
  }

  /**
   * 追加工具调用
   */
  function handleAppendToolCall(chunk: AIStreamToolCallChunk) {
    handleToolCall(chunk);
  }

  /**
   * 处理工具输入开始。
   */
  function handleAppendToolInputStart(chunk: AIStreamToolInputStartChunk) {
    appendAssistantToolInputStart(chunk);
  }

  /**
   * 处理工具输入增量。
   */
  async function handleAppendToolInputDelta(chunk: AIStreamToolInputDeltaChunk): Promise<void> {
    await appendAssistantToolInputDelta(chunk);
  }

  /**
   * 处理工具输入结束。
   */
  function handleAppendToolInputEnd(chunk: AIStreamToolInputEndChunk) {
    appendAssistantToolInputEnd(chunk);
  }

  /**
   * 处理远端 SDK 工具结果。
   * 这些结果已经由主进程完成执行，前端只负责补充展示，不参与本地工具续轮。
   */
  function handleAppendToolResult(chunk: AIStreamToolResultChunk) {
    appendAssistantRemoteToolResult(chunk);
  }

  /**
   * 准备助手消息占位符
   */
  function handlePrepareAssistantMessage(reuseLastAssistant: boolean): Message | undefined {
    const lastMessage = messages.value[messages.value.length - 1];
    if (reuseLastAssistant && lastMessage?.role === 'assistant') {
      lastMessage.loading = true;
      lastMessage.finished = false;
      lastMessage.createdAt ||= dayjs().toISOString();
      return lastMessage;
    }

    const placeholder = create.assistantPlaceholder();
    messages.value.push(placeholder);
    return placeholder;
  }

  /**
   * 根据已启用的 MCP server 生成主进程请求配置。
   * @returns 发往主进程的 MCP 请求配置
   */
  function resolveMcpRequestConfig(): AIMCPRequestConfig {
    const servers = toolSettingsStore.mcp.servers.map((server) => ({
      ...server,
      args: [...server.args],
      env: { ...server.env },
      headers: { ...server.headers },
      toolAllowlist: [...server.toolAllowlist]
    }));

    return {
      servers,
      enabledServerIds: servers
        .filter((server) => {
          if (!server.enabled) return false;
          if (server.transport === 'stdio') return server.command.trim().length > 0;
          return Boolean(server.url?.trim());
        })
        .map((server) => server.id),
      enabledTools: [],
      toolInstructions: ''
    };
  }

  /**
   * 流式传输消息
   */
  async function handleStreamMessages(sourceMessages: Message[], config: ServiceConfig, reuseLastAssistant = false): Promise<void> {
    // 新消息提交时重置工具循环防护器，避免上一轮对话的状态泄露
    !reuseLastAssistant && startToolLoopSession();
    loading.value = true;
    activeTaskType.value = 'chat';
    lastServiceConfig = config;
    currentToolRoundId += 1;
    currentToolCallTracker = createToolCallTracker();
    handlePrepareAssistantMessage(reuseLastAssistant);

    // 处理文件引用
    const nextMessages = buildChatMessageReferences(sourceMessages);
    const resolvedTools = resolveTools();
    const transportTools = config.toolSupport.supported && Boolean(resolvedTools.length) ? toTransportTools(resolvedTools) : undefined;

    currentModelMessageCache = convert.toCachedModelMessages(nextMessages, currentModelMessageCache);
    const continuedMessages: ModelMessage[] = [...currentModelMessageCache.modelMessages];

    const memoryStore = useMemoryStore();
    if (!memoryStore.loaded) await memoryStore.loadMemory();
    const memoryContext = memoryStore.buildSystemPromptContext();

    agent.stream({
      messages: continuedMessages,
      modelId: config.modelId,
      providerId: config.providerId,
      system: memoryContext || undefined,
      tools: transportTools,
      tavily: toolSettingsStore.tavily,
      mcp: resolveMcpRequestConfig()
    });
  }

  /**
   * 处理流式完成
   */
  async function handleStreamComplete(): Promise<void> {
    flushAllBuffers();

    if (aborting.value) {
      aborting.value = false;
      activeTaskType.value = null;
      return;
    }

    const roundId = currentToolRoundId;
    const tracker = currentToolCallTracker;

    await tracker.waitForAll();
    if (!roundId || roundId !== currentToolRoundId) {
      loading.value = false;
      activeTaskType.value = null;
      return;
    }

    if (blockedToolLoopReason.value) {
      loading.value = false;
      activeTaskType.value = null;
      executedToolCallIds = new Set();
      return;
    }

    const message = messages.value[messages.value.length - 1];
    if (message?.role === 'error') {
      loading.value = false;
      activeTaskType.value = null;
      return;
    }

    if (awaitingUserChoice.value || userChoice.findPending(messages.value)) {
      finalizeAssistantMessageAwaitingUserChoice();
      loading.value = true;
      activeTaskType.value = null;
      if (message) {
        await onComplete?.(message);
      }
      return;
    }

    loading.value = false;
    activeTaskType.value = null;

    if (message) {
      message.loading = false;
      message.finished = true;
    }

    if (pendingToolResults.value.length && lastServiceConfig) {
      const roundGuardResult = currentToolLoopGuard.advanceRound();
      if (!roundGuardResult.allowed) {
        executedToolCallIds = new Set();
        await stopToolLoop(roundGuardResult.reason ?? '工具调用轮次超过限制，已停止自动续轮。');
        return;
      }

      pendingToolResults.value = [];
      if (message) {
        await onComplete?.(message);
      }
      nextTick(() => {
        handleStreamMessages(messages.value, lastServiceConfig as ServiceConfig, true);
      });
      return;
    }

    if (message && lastServiceConfig && shouldContinueAfterSdkToolResult(message)) {
      const roundGuardResult = currentToolLoopGuard.advanceRound();
      if (!roundGuardResult.allowed) {
        executedToolCallIds = new Set();
        appendSilentSdkCompletionHint(message);
        await onComplete?.(message);
        return;
      }

      nextTick(() => {
        handleStreamMessages(messages.value, lastServiceConfig as ServiceConfig, true);
      });
      return;
    }

    executedToolCallIds = new Set();

    if (message) {
      appendSilentSdkCompletionHint(message);
      await onComplete?.(message);
    }
  }

  /**
   * 处理流式错误
   * 当 AI 服务返回错误时触发，重置状态并显示错误消息
   * @param error - AI 服务错误对象
   */
  async function handleStreamError(error: AIServiceError): Promise<void> {
    flushAllBuffers();
    loading.value = false;
    activeTaskType.value = null;
    resetToolLoopState();
    removeTrailingEmptyAssistantMessage();

    const errorMessage = mergeErrorMessage(error.message);
    await onComplete?.(errorMessage);
  }

  /**
   * 查找重新生成起始索引
   */
  function findRegenerateStartIndex(targetMessage: Message): number {
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
   * 中止流式传输，等待助手消息持久化完成后再返回。
   * 确保 handleAbort 中的 interrupt 消息在 assistant 消息之后保存。
   */
  async function abort() {
    aborting.value = true;
    loading.value = false;
    activeTaskType.value = null;
    const message = finalizeCurrentAssistantMessage();
    if (message) {
      finalizeToolPartsAsCancelled(message);
    }
    resetToolLoopState();
    agent.abort();
    if (message && onComplete) {
      await onComplete(message);
    }
  }

  /**
   * 用户选择提交
   */
  async function submitUserChoice(answer: AIUserChoiceAnswerData): Promise<boolean> {
    const isAwaitingChoice = awaitingUserChoice.value || userChoice.findPending(messages.value);
    if (loading.value && !isAwaitingChoice) {
      return false;
    }

    const submitted = userChoice.submitAnswer(messages.value, answer);
    if (!submitted) {
      return false;
    }

    const config = lastServiceConfig ?? (await resolveServiceConfig());
    if (!config) {
      return false;
    }

    awaitingUserChoice.value = false;
    pendingToolResults.value = [];
    nextTick(() => {
      handleStreamMessages(messages.value, config, true);
    });
    return true;
  }

  /**
   * 重新生成。
   * 先立即更新 UI（删除旧消息、创建加载占位符），再执行异步操作，
   * 避免用户点击后长时间无视觉反馈。
   */
  async function regenerate(message: Message): Promise<boolean> {
    if (loading.value) {
      return false;
    }

    const startIndex = findRegenerateStartIndex(message);
    if (startIndex === -1) {
      return false;
    }

    const sourceMessages = messages.value.slice(0, startIndex + 1);
    const removedMessages = messages.value.slice(startIndex + 1);

    // 立即更新 UI，让用户感知操作已响应
    loading.value = true;
    activeTaskType.value = 'chat';
    messages.value.splice(0, messages.value.length, ...sourceMessages);
    handlePrepareAssistantMessage(false);
    startToolLoopSession();

    // 异步操作：解析服务配置
    const config = await resolveServiceConfig();
    if (!config) {
      // 配置解析失败，回滚 UI 状态
      messages.value.splice(0, messages.value.length, ...sourceMessages, ...removedMessages);
      removeTrailingEmptyAssistantMessage();
      loading.value = false;
      activeTaskType.value = null;
      return false;
    }

    // 异步操作：持久化消息
    await onBeforeRegenerate?.(sourceMessages, message);

    // 复用已创建的占位符开始流式传输
    nextTick(() => handleStreamMessages(sourceMessages, config, true));
    return true;
  }

  return {
    loading,
    stream: {
      appendText,
      appendThinking,
      appendToolCall: handleAppendToolCall,
      prepareAssistantMessage: handlePrepareAssistantMessage,
      streamMessages: handleStreamMessages,
      resolveServiceConfig,
      abort,
      submitUserChoice,
      regenerate
    }
  };
}

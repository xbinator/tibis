/**
 * @file useChatRuntime.ts
 * @description BChat renderer 侧 ChatRuntime 桥接 hook。
 */
import type { Message } from '../utils/types';
import type { AIServiceError, AIToolContext, AIToolExecutionError, AIToolExecutionResult, AIToolExecutor, AIToolGrantScope } from 'types/ai';
import type { ChatMessagePart, ChatMessageRecord, ChatMessageToolPart } from 'types/chat';
import type {
  ChatRuntimeContinueInput,
  ChatRuntimeConfirmationDecision,
  ChatRuntimeConfirmationRequest,
  ChatRuntimeConfirmationRequestEvent,
  ChatRuntimeBridgeRequestEvent,
  ChatRuntimeBridgeResult,
  ChatRuntimeContextUsageSnapshot,
  ChatRuntimeEventMap,
  ChatRuntimeHandlerResult,
  ChatRuntimeMessageDeletedEvent,
  ChatRuntimeMessageSnapshot,
  ChatRuntimeMessageEvent,
  ChatRuntimeSendInput,
  ChatRuntimeStartResult,
  ChatRuntimeSubmitUserChoiceInput,
  ChatRuntimeToolRequestEvent
} from 'types/chat-runtime';
import type { WidgetDisplayPayload } from 'types/widget';
import type { Ref } from 'vue';
import { onScopeDispose, ref, toRaw } from 'vue';
import { isEqual } from 'lodash-es';
import { OPEN_WIDGET_TOOL_NAME } from '@/ai/tools/builtin/WidgetTool';
import { executeToolCall } from '@/ai/tools/stream';
import { getElectronAPI } from '@/shared/platform/electron-api';
import { isWidgetDisplayPayload } from '@/shared/widget/protocol';
import { useToolPermissionStore } from '@/stores/chat/toolPermission';
import { createRuntimeRequestError, localizeRuntimeServiceError } from '../utils/runtimeError';

/** ChatRuntime hook 选项。 */
interface UseChatRuntimeOptions {
  /** 当前消息列表。 */
  messages: Ref<Message[]>;
  /** 获取当前会话 ID。 */
  getSessionId: () => string | undefined;
  /** runtime 完成回调。 */
  onComplete?: (message: Message) => Promise<void> | void;
  /** runtime 错误回调。 */
  onError?: (error: AIServiceError) => Promise<void> | void;
  /** runtime 上下文用量更新回调。 */
  onContextUsageUpdated?: (snapshot: ChatRuntimeContextUsageSnapshot) => Promise<void> | void;
  /** runtime 确认请求回调。 */
  requestConfirmation?: (request: ChatRuntimeConfirmationRequest) => Promise<ChatRuntimeConfirmationDecision> | ChatRuntimeConfirmationDecision;
  /** runtime 通用 renderer bridge 请求回调。 */
  handleBridgeRequest?: (event: ChatRuntimeBridgeRequestEvent) => Promise<unknown> | unknown;
  /** 判断指定 runtime 事件是否应被忽略。 */
  isRuntimeEventIgnored?: (runtimeId: string) => boolean;
  /** renderer client id。 */
  clientId?: string;
  /** 当前 agent id。 */
  agentId?: string;
  /** 可由 renderer 执行的本地工具。 */
  tools?: AIToolExecutor[] | (() => AIToolExecutor[]);
  /** 获取 renderer 工具上下文。 */
  getToolContext?: () => AIToolContext | undefined;
}

/** ChatRuntime 发送输入。 */
export type BChatRuntimeSendInput = Pick<
  ChatRuntimeSendInput,
  | 'sessionId'
  | 'content'
  | 'parts'
  | 'files'
  | 'userMessageId'
  | 'userMessageCreatedAt'
  | 'contextWindow'
  | 'system'
  | 'workspaceRoot'
  | 'tools'
  | 'tavily'
  | 'mcp'
>;

/** Runtime renderer 工具失败可透传的稳定错误码。 */
const RUNTIME_TOOL_ERROR_CODES: AIToolExecutionError['code'][] = [
  'TOOL_NOT_FOUND',
  'INVALID_INPUT',
  'NO_ACTIVE_DOCUMENT',
  'NO_SELECTION',
  'NO_CURSOR',
  'PERMISSION_DENIED',
  'USER_CANCELLED',
  'EDITOR_UNAVAILABLE',
  'STALE_CONTEXT',
  'STALE_SNAPSHOT',
  'PAGE_LOADING',
  'ELEMENT_NOT_FOUND',
  'ACTION_NOT_SUPPORTED',
  'OPTION_AMBIGUOUS',
  'SCROLL_TARGET_NOT_FOUND',
  'BRIDGE_TIMEOUT',
  'TOOL_TIMEOUT',
  'UNSUPPORTED_PROVIDER',
  'CONFIRMATION_DISMISSED',
  'EXECUTION_FAILED'
];

/** ChatRuntime 续轮输入。 */
export type BChatRuntimeContinueInput = Pick<
  ChatRuntimeContinueInput,
  'sessionId' | 'contextWindow' | 'system' | 'workspaceRoot' | 'tools' | 'tavily' | 'mcp'
> & {
  /** renderer 消息列表，发送到主进程前会转换为纯 runtime 快照。 */
  messages: Message[];
};

/** ChatRuntime 用户选择提交输入。 */
export type BChatRuntimeSubmitUserChoiceInput = Pick<
  ChatRuntimeSubmitUserChoiceInput,
  'sessionId' | 'contextWindow' | 'system' | 'workspaceRoot' | 'tools' | 'tavily' | 'mcp' | 'answer'
>;

/**
 * 可能包含主进程 runtime 扩展字段的 renderer 消息。
 */
interface RuntimeMessageLike extends Message {
  /** 所属会话 ID，runtime 回写消息中可能存在。 */
  sessionId?: string;
  /** 是否为压缩摘要消息。 */
  summary?: boolean;
  /** runtime 扩展元数据。 */
  meta?: ChatMessageRecord['meta'];
}

/**
 * 判断 runtime 事件是否属于当前 renderer 会话。
 * @param event - runtime 事件
 * @param sessionId - 当前会话 ID
 * @param clientId - renderer client id
 * @returns 是否应处理该事件
 */
function isCurrentRuntimeEvent(event: ChatRuntimeEventMap[keyof ChatRuntimeEventMap], sessionId: string | undefined, clientId: string): boolean {
  return Boolean(sessionId && event.sessionId === sessionId && event.clientId === clientId);
}

/**
 * 读取已记住的 runtime 工具确认决策。
 * @param request - runtime 确认请求
 * @returns 可自动批准的确认决策，不存在授权时返回 null
 */
function getRememberedRuntimeConfirmationDecision(request: ChatRuntimeConfirmationRequest): ChatRuntimeConfirmationDecision | null {
  if (request.allowRemember !== true) return null;

  const toolPermissionStore = useToolPermissionStore();
  if (toolPermissionStore.alwaysToolPermissionGrants[request.toolName] || toolPermissionStore.sessionToolPermissionGrants[request.toolName]) {
    return { approved: true };
  }

  return null;
}

/**
 * 判断 runtime 确认决策是否允许被记住。
 * @param request - runtime 确认请求
 * @param decision - 用户确认决策
 * @returns 是否可以写入工具授权记录
 */
function canRememberRuntimeConfirmationDecision(
  request: ChatRuntimeConfirmationRequest,
  decision: ChatRuntimeConfirmationDecision
): decision is { approved: true; grantScope: AIToolGrantScope } {
  if (!decision.approved || request.allowRemember !== true || !decision.grantScope) return false;

  return request.rememberScopes?.includes(decision.grantScope) === true;
}

/**
 * 记住 runtime 工具确认授权。
 * @param request - runtime 确认请求
 * @param decision - 用户确认决策
 */
function rememberRuntimeConfirmationDecision(request: ChatRuntimeConfirmationRequest, decision: ChatRuntimeConfirmationDecision): void {
  if (!canRememberRuntimeConfirmationDecision(request, decision)) return;

  const toolPermissionStore = useToolPermissionStore();
  toolPermissionStore.grantToolPermission(request.toolName, decision.grantScope);
}

/**
 * 获取同一时间戳下的消息展示顺序。
 * @param role - 消息角色
 * @returns 展示顺序权重
 */
function getRuntimeMessageRoleOrder(role: Message['role']): number {
  const roleOrder: Record<Message['role'], number> = {
    system: 0,
    compression: 1,
    user: 2,
    assistant: 3,
    interrupt: 4,
    error: 5
  };

  return roleOrder[role];
}

/**
 * 按 ChatRuntime 展示顺序比较消息。
 * @param left - 左侧消息
 * @param right - 右侧消息
 * @returns 排序比较值
 */
function compareRuntimeMessages(left: Message, right: Message): number {
  if (left.createdAt !== right.createdAt) return left.createdAt.localeCompare(right.createdAt);

  const roleOrderDelta = getRuntimeMessageRoleOrder(left.role) - getRuntimeMessageRoleOrder(right.role);
  if (roleOrderDelta !== 0) return roleOrderDelta;

  return left.id.localeCompare(right.id);
}

/**
 * 判断消息片段是否为工具片段。
 * @param part - 消息片段
 * @returns 是否为工具片段
 */
function isToolMessagePart(part: ChatMessagePart): part is ChatMessageToolPart {
  return part.type === 'tool';
}

/**
 * 查找同一个工具调用在本地消息中的片段。
 * @param parts - 本地消息片段列表
 * @param nextPart - runtime 新消息中的工具片段
 * @returns 匹配的本地工具片段
 */
function findPreviousToolPart(parts: ChatMessagePart[], nextPart: ChatMessageToolPart): ChatMessageToolPart | undefined {
  return parts.find(
    (part): part is ChatMessageToolPart =>
      isToolMessagePart(part) && part.toolName === nextPart.toolName && (part.toolCallId === nextPart.toolCallId || part.id === nextPart.id)
  );
}

/**
 * 判断工具片段是否为可展示的 open_widget 结果。
 * @param part - 工具消息片段
 * @returns 是否为可展示的 open_widget 结果
 */
function isOpenWidgetDisplayToolPart(part: ChatMessageToolPart): part is ChatMessageToolPart & { result: { status: 'success'; data: WidgetDisplayPayload } } {
  return part.toolName === OPEN_WIDGET_TOOL_NAME && part.result?.status === 'success' && isWidgetDisplayPayload(part.result.data);
}

/**
 * 判断两个 open_widget 工具片段是否来自同一份展示载荷。
 * @param previousPart - 本地旧工具片段
 * @param nextPart - runtime 新工具片段
 * @returns 两者展示载荷一致时返回 true
 */
function isSameOpenWidgetDisplayPayload(previousPart: ChatMessageToolPart, nextPart: ChatMessageToolPart): boolean {
  if (!isOpenWidgetDisplayToolPart(previousPart) || !isOpenWidgetDisplayToolPart(nextPart)) return false;

  const previousData = previousPart.result.data;
  const nextData = nextPart.result.data;

  return (
    previousData.sessionId === nextData.sessionId &&
    previousData.widgetId === nextData.widgetId &&
    isEqual(previousData.value, nextData.value) &&
    isEqual(previousData.renderContext, nextData.renderContext)
  );
}

/**
 * 合并工具片段上的 renderer 本地运行态字段。
 * runtime 流式事件会带主进程创建的初始 widget，renderer 已运行过的状态需要继续保留。
 * @param previousParts - 本地旧消息片段列表
 * @param nextParts - runtime 新消息片段列表
 * @returns 保留本地运行态后的片段列表
 */
function mergeRuntimeMessageParts(previousParts: ChatMessagePart[], nextParts: ChatMessagePart[]): ChatMessagePart[] {
  return nextParts.map((nextPart): ChatMessagePart => {
    if (!isToolMessagePart(nextPart)) return nextPart;

    const previousPart = findPreviousToolPart(previousParts, nextPart);
    if (!previousPart?.widget) return nextPart;
    if (!isSameOpenWidgetDisplayPayload(previousPart, nextPart)) return nextPart;

    return {
      ...nextPart,
      id: previousPart.id,
      presentation: previousPart.presentation ?? nextPart.presentation,
      widget: previousPart.widget
    };
  });
}

/**
 * 合并 runtime 新消息与 renderer 本地消息。
 * @param previousMessage - 本地旧消息
 * @param nextMessage - runtime 新消息
 * @returns 合并后的本地消息
 */
function mergeRuntimeMessage(previousMessage: Message, nextMessage: Message): Message {
  return {
    ...previousMessage,
    ...nextMessage,
    parts: mergeRuntimeMessageParts(previousMessage.parts, nextMessage.parts)
  };
}

/**
 * 将 runtime 消息写入本地列表。
 * @param messages - 本地消息列表
 * @param nextMessage - runtime 消息
 */
function upsertRuntimeMessage(messages: Message[], nextMessage: Message): void {
  const index = messages.findIndex((message) => message.id === nextMessage.id);
  if (index === -1) {
    messages.push(nextMessage);
    messages.sort(compareRuntimeMessages);
    return;
  }

  messages.splice(index, 1, mergeRuntimeMessage(messages[index], nextMessage));
  messages.sort(compareRuntimeMessages);
}

/**
 * 从本地列表移除 runtime 消息。
 * @param messages - 本地消息列表
 * @param messageId - 待移除消息 ID
 */
function removeRuntimeMessage(messages: Message[], messageId: string): void {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index !== -1) {
    messages.splice(index, 1);
  }
}

/**
 * 查找 runtime 最近完成的 assistant 消息。
 * @param messages - 本地消息列表
 * @param runtimeId - runtime ID
 * @returns assistant 消息
 */
function findCompletedAssistantMessage(messages: Message[], runtimeId: string): Message | undefined {
  return [...messages].reverse().find((message) => message.role === 'assistant' && message.runtimeId === runtimeId && message.finished === true);
}

/**
 * 将值转换为可通过 Electron IPC structured clone 的纯数据。
 * @param value - 待转换值
 * @returns 去除 Vue Proxy 后的 JSON 兼容数据
 */
function toCloneableData<T>(value: T): T {
  if (value === undefined) return value;

  return JSON.parse(JSON.stringify(toRaw(value))) as T;
}

/**
 * 将 renderer 消息转换为 ChatRuntime continuation 使用的纯快照。
 * @param message - renderer 消息
 * @param sessionId - 当前会话 ID
 * @returns 可 structured clone 的 runtime 消息快照
 */
function toRuntimeMessageSnapshot(message: Message, sessionId: string): ChatRuntimeMessageSnapshot {
  const rawMessage = toRaw(message) as RuntimeMessageLike;

  return {
    id: rawMessage.id,
    sessionId: rawMessage.sessionId ?? sessionId,
    role: rawMessage.role,
    content: rawMessage.content,
    parts: toCloneableData(rawMessage.parts),
    ...(rawMessage.thinking !== undefined ? { thinking: rawMessage.thinking } : {}),
    ...(rawMessage.files !== undefined ? { files: toCloneableData(rawMessage.files) } : {}),
    ...(rawMessage.usage !== undefined ? { usage: toCloneableData(rawMessage.usage) } : {}),
    ...(rawMessage.compression !== undefined ? { compression: toCloneableData(rawMessage.compression) } : {}),
    ...(rawMessage.summary !== undefined ? { summary: rawMessage.summary } : {}),
    ...(rawMessage.agentId !== undefined ? { agentId: rawMessage.agentId } : {}),
    ...(rawMessage.runtimeId !== undefined ? { runtimeId: rawMessage.runtimeId } : {}),
    ...(rawMessage.parentRuntimeId !== undefined ? { parentRuntimeId: rawMessage.parentRuntimeId } : {}),
    ...(rawMessage.meta !== undefined ? { meta: toCloneableData(rawMessage.meta) } : {}),
    createdAt: rawMessage.createdAt,
    ...(rawMessage.loading !== undefined ? { loading: rawMessage.loading } : {}),
    ...(rawMessage.finished !== undefined ? { finished: rawMessage.finished } : {})
  };
}

/**
 * 将续轮输入转换为 Electron IPC 可传输的命令。
 * @param input - renderer 续轮输入
 * @param clientId - renderer client id
 * @param agentId - 当前 agent id
 * @returns 可传输的 ChatRuntime 续轮命令
 */
function toRuntimeContinueCommand(input: BChatRuntimeContinueInput, clientId: string, agentId: string): ChatRuntimeContinueInput {
  const messages = input.messages.map((message) => toRuntimeMessageSnapshot(message, input.sessionId));

  return toCloneableData({ ...input, clientId, agentId, messages });
}

/**
 * 将新会话发送输入转换为 Electron IPC 可传输的命令。
 * @param input - renderer 发送输入
 * @param clientId - renderer client id
 * @param agentId - 当前 agent id
 * @returns 可 structured clone 的 ChatRuntime 发送命令
 */
function toRuntimeSendCommand(input: BChatRuntimeSendInput, clientId: string, agentId: string): ChatRuntimeSendInput {
  return toCloneableData({ ...input, clientId, agentId });
}

/**
 * 解包 runtime IPC 结果。
 * @param result - handler 结果
 * @returns handler data
 */
function unwrapRuntimeResult<T>(result: ChatRuntimeHandlerResult<T>): T {
  if (!result.ok || result.data === undefined) {
    throw createRuntimeRequestError(result);
  }

  return result.data;
}

/**
 * 解析当前可用 renderer 工具列表。
 * @param tools - 静态工具列表或动态 getter
 * @returns 工具列表
 */
function resolveRuntimeTools(tools: UseChatRuntimeOptions['tools']): AIToolExecutor[] {
  return typeof tools === 'function' ? tools() : tools ?? [];
}

/**
 * 判断未知错误码是否为工具执行稳定错误码。
 * @param code - 待判断错误码
 * @returns 是否为工具执行错误码
 */
function isRuntimeToolErrorCode(code: unknown): code is AIToolExecutionError['code'] {
  return typeof code === 'string' && RUNTIME_TOOL_ERROR_CODES.includes(code as AIToolExecutionError['code']);
}

/**
 * 创建工具执行失败结果。
 * @param toolName - 工具名称
 * @param error - 原始错误
 * @returns 工具执行失败结果
 */
function createRuntimeToolFailureResult(toolName: string, error: unknown): AIToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  const rawCode = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;

  return {
    toolName,
    status: 'failure',
    error: {
      code: isRuntimeToolErrorCode(rawCode) ? rawCode : 'EXECUTION_FAILED',
      message
    }
  };
}

/**
 * 创建 runtime renderer 工具不可用结果。
 * @param toolName - 工具名称
 * @param message - 失败描述
 * @returns 工具失败结果
 */
function createRuntimeToolUnavailableResult(toolName: string, message: string): AIToolExecutionResult {
  return {
    toolName,
    status: 'failure',
    error: {
      code: 'EDITOR_UNAVAILABLE',
      message
    }
  };
}

/**
 * 创建 runtime bridge 失败结果。
 * @param error - 原始错误
 * @returns bridge 失败结果
 */
function createRuntimeBridgeFailureResult(error: unknown): ChatRuntimeBridgeResult {
  const message = error instanceof Error ? error.message : String(error);
  const rawCode = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;

  return {
    status: 'failure',
    error: {
      code: isRuntimeToolErrorCode(rawCode) ? rawCode : 'EXECUTION_FAILED',
      message
    }
  };
}

/**
 * 确保 runtime IPC 调用成功。
 * @param result - handler 结果
 */
function assertRuntimeResult(result: ChatRuntimeHandlerResult<void>): void {
  if (!result.ok) {
    throw createRuntimeRequestError(result);
  }
}

/**
 * BChat renderer 侧主进程 ChatRuntime hook。
 * @param options - hook 选项
 * @returns runtime 操作
 */
export function useChatRuntime(options: UseChatRuntimeOptions) {
  const clientId = options.clientId ?? 'bchat';
  const agentId = options.agentId ?? 'default';
  const electronAPI = getElectronAPI();
  const activeRuntimeId = ref<string | null>(null);
  /** 已发起中止的 runtime ID，用于拒绝中止后迟到的交互请求。 */
  const abortedRuntimeIds = new Set<string>();

  /**
   * 判断 runtime 交互请求是否已经失效。
   * @param runtimeId - runtime ID
   * @returns 是否应拒绝处理
   */
  function isRuntimeInteractionRequestStale(runtimeId: string): boolean {
    if (options.isRuntimeEventIgnored?.(runtimeId) === true) return true;
    if (abortedRuntimeIds.has(runtimeId)) return true;

    return activeRuntimeId.value !== null && activeRuntimeId.value !== runtimeId;
  }

  /**
   * 处理 runtime 消息事件。
   * @param event - runtime 消息事件
   */
  function handleMessageEvent(event: ChatRuntimeMessageEvent): void {
    if (!isCurrentRuntimeEvent(event, options.getSessionId(), clientId)) return;
    if (options.isRuntimeEventIgnored?.(event.runtimeId) === true) return;

    upsertRuntimeMessage(options.messages.value, event.message as Message);
  }

  /**
   * 处理 runtime 删除消息事件。
   * @param event - runtime 删除消息事件
   */
  function handleMessageDeletedEvent(event: ChatRuntimeMessageDeletedEvent): void {
    if (!isCurrentRuntimeEvent(event, options.getSessionId(), clientId)) return;
    if (options.isRuntimeEventIgnored?.(event.runtimeId) === true) return;

    removeRuntimeMessage(options.messages.value, event.messageId);
  }

  /**
   * 处理 runtime 完成事件。
   * @param event - runtime 完成事件
   */
  function handleCompleteEvent(event: ChatRuntimeEventMap['chat:runtime:complete']): void {
    if (!isCurrentRuntimeEvent(event, options.getSessionId(), clientId)) return;
    if (options.isRuntimeEventIgnored?.(event.runtimeId) === true) return;
    if (activeRuntimeId.value === event.runtimeId) {
      activeRuntimeId.value = null;
    }

    const completedMessage = findCompletedAssistantMessage(options.messages.value, event.runtimeId);
    if (completedMessage) {
      Promise.resolve(options.onComplete?.(completedMessage)).catch(() => undefined);
    }
  }

  /**
   * 处理 runtime 错误事件。
   * @param event - runtime 错误事件
   */
  function handleErrorEvent(event: ChatRuntimeEventMap['chat:runtime:error']): void {
    if (!isCurrentRuntimeEvent(event, options.getSessionId(), clientId)) return;
    if (options.isRuntimeEventIgnored?.(event.runtimeId) === true) return;

    Promise.resolve(options.onError?.(localizeRuntimeServiceError(event.error))).catch(() => undefined);
  }

  /**
   * 处理 runtime 上下文用量更新事件。
   * @param event - runtime 上下文用量事件
   */
  function handleContextUsageEvent(event: ChatRuntimeEventMap['chat:runtime:context-usage-updated']): void {
    if (!isCurrentRuntimeEvent(event, options.getSessionId(), clientId)) return;
    if (options.isRuntimeEventIgnored?.(event.runtimeId) === true) return;

    Promise.resolve(options.onContextUsageUpdated?.(event.snapshot)).catch(() => undefined);
  }

  /**
   * 提交 renderer 工具执行结果。
   * @param event - 工具请求事件
   * @param result - 工具执行结果
   */
  async function submitToolResult(event: ChatRuntimeToolRequestEvent, result: AIToolExecutionResult): Promise<void> {
    assertRuntimeResult(await electronAPI.chatRuntimeSubmitToolResult(toCloneableData({ runtimeId: event.runtimeId, toolCallId: event.toolCallId, result })));
  }

  /**
   * 提交 runtime 确认决策。
   * @param event - 确认请求事件
   * @param decision - 确认决策
   */
  async function submitConfirmationDecision(event: ChatRuntimeConfirmationRequestEvent, decision: ChatRuntimeConfirmationDecision): Promise<void> {
    assertRuntimeResult(
      await electronAPI.chatRuntimeSubmitConfirmation(toCloneableData({ runtimeId: event.runtimeId, confirmationId: event.confirmationId, decision }))
    );
  }

  /**
   * 提交 runtime bridge 响应。
   * @param event - bridge 请求事件
   * @param result - bridge 结果
   */
  async function submitBridgeResponse(event: ChatRuntimeBridgeRequestEvent, result: ChatRuntimeBridgeResult): Promise<void> {
    assertRuntimeResult(await electronAPI.chatRuntimeSubmitBridgeResponse(toCloneableData({ runtimeId: event.runtimeId, requestId: event.requestId, result })));
  }

  /**
   * 处理 runtime 工具请求事件。
   * @param event - 工具请求事件
   */
  async function handleToolRequestEvent(event: ChatRuntimeToolRequestEvent): Promise<void> {
    if (event.clientId !== clientId) return;
    if (event.sessionId !== options.getSessionId()) {
      await submitToolResult(event, createRuntimeToolUnavailableResult(event.toolName, '当前会话已切换，无法执行工具'));
      return;
    }

    try {
      const executedToolCall = await executeToolCall(
        { toolCallId: event.toolCallId, toolName: event.toolName, input: event.input },
        resolveRuntimeTools(options.tools),
        options.getToolContext?.(),
        { runtimeId: event.runtimeId }
      );
      await submitToolResult(event, executedToolCall.result);
    } catch (error) {
      await submitToolResult(event, createRuntimeToolFailureResult(event.toolName, error));
    }
  }

  /**
   * 处理 runtime 确认请求事件。
   * @param event - 确认请求事件
   */
  async function handleConfirmationRequestEvent(event: ChatRuntimeConfirmationRequestEvent): Promise<void> {
    if (event.clientId !== clientId) return;
    if (event.sessionId !== options.getSessionId()) {
      await submitConfirmationDecision(event, { approved: false });
      return;
    }
    if (isRuntimeInteractionRequestStale(event.runtimeId)) {
      await submitConfirmationDecision(event, { approved: false });
      return;
    }

    const rememberedDecision = getRememberedRuntimeConfirmationDecision(event.request);
    if (rememberedDecision) {
      await submitConfirmationDecision(event, rememberedDecision);
      return;
    }

    const decision = options.requestConfirmation ? await options.requestConfirmation(event.request) : { approved: false };
    rememberRuntimeConfirmationDecision(event.request, decision);
    await submitConfirmationDecision(event, decision);
  }

  /**
   * 处理 runtime bridge 请求事件。
   * @param event - bridge 请求事件
   */
  async function handleBridgeRequestEvent(event: ChatRuntimeBridgeRequestEvent): Promise<void> {
    if (event.clientId !== clientId) return;
    if (event.sessionId !== options.getSessionId()) {
      await submitBridgeResponse(event, {
        status: 'failure',
        error: { code: 'EDITOR_UNAVAILABLE', message: '当前会话已切换，无法执行 bridge 请求' }
      });
      return;
    }

    try {
      const data = options.handleBridgeRequest ? await options.handleBridgeRequest(event) : undefined;
      await submitBridgeResponse(event, { status: 'success', data });
    } catch (error) {
      await submitBridgeResponse(event, createRuntimeBridgeFailureResult(error));
    }
  }

  const disposeMessageCreated = electronAPI.chatRuntimeOnMessageCreated(handleMessageEvent);
  const disposeMessageUpdated = electronAPI.chatRuntimeOnMessageUpdated(handleMessageEvent);
  const disposeMessageDeleted = electronAPI.chatRuntimeOnMessageDeleted(handleMessageDeletedEvent);
  const disposeContextUsage = electronAPI.chatRuntimeOnContextUsageUpdated(handleContextUsageEvent);
  const disposeToolRequest = electronAPI.chatRuntimeOnToolRequest((event) => {
    handleToolRequestEvent(event).catch(() => undefined);
  });
  const disposeConfirmationRequest = electronAPI.chatRuntimeOnConfirmationRequested((event) => {
    handleConfirmationRequestEvent(event).catch(() => undefined);
  });
  const disposeBridgeRequest = electronAPI.chatRuntimeOnBridgeRequested((event) => {
    handleBridgeRequestEvent(event).catch(() => undefined);
  });
  const disposeComplete = electronAPI.chatRuntimeOnComplete(handleCompleteEvent);
  const disposeError = electronAPI.chatRuntimeOnError(handleErrorEvent);

  onScopeDispose(() => {
    disposeMessageCreated();
    disposeMessageUpdated();
    disposeMessageDeleted();
    disposeContextUsage();
    disposeToolRequest();
    disposeConfirmationRequest();
    disposeBridgeRequest();
    disposeComplete();
    disposeError();
  });

  /**
   * 通过主进程 ChatRuntime 发送一轮消息。
   * @param input - 发送输入
   * @returns runtime 启动结果
   */
  async function send(input: BChatRuntimeSendInput): Promise<ChatRuntimeStartResult> {
    const result = unwrapRuntimeResult(await electronAPI.chatRuntimeSend(toRuntimeSendCommand(input, clientId, agentId)));
    activeRuntimeId.value = result.completed === true ? null : result.runtimeId;
    return result;
  }

  /**
   * 通过主进程 ChatRuntime 继续一轮暂停消息。
   * @param input - 续轮输入
   * @returns runtime 启动结果
   */
  async function continueTurn(input: BChatRuntimeContinueInput): Promise<ChatRuntimeStartResult> {
    const result = unwrapRuntimeResult(await electronAPI.chatRuntimeContinue(toRuntimeContinueCommand(input, clientId, agentId)));
    activeRuntimeId.value = result.completed === true ? null : result.runtimeId;
    return result;
  }

  /**
   * 通过主进程 ChatRuntime 提交用户选择答案并续跑。
   * @param input - 用户选择提交输入
   * @returns runtime 启动结果
   */
  async function submitUserChoice(input: BChatRuntimeSubmitUserChoiceInput): Promise<ChatRuntimeStartResult> {
    const result = unwrapRuntimeResult(await electronAPI.chatRuntimeSubmitUserChoice(toCloneableData({ ...input, clientId, agentId })));
    activeRuntimeId.value = result.completed === true ? null : result.runtimeId;
    return result;
  }

  /**
   * 中止当前活跃 runtime。
   */
  async function abort(): Promise<void> {
    const runtimeId = activeRuntimeId.value;
    if (!runtimeId) return;

    abortedRuntimeIds.add(runtimeId);
    try {
      assertRuntimeResult(await electronAPI.chatRuntimeAbort({ runtimeId }));
      if (activeRuntimeId.value === runtimeId) {
        activeRuntimeId.value = null;
      }
    } catch (error) {
      abortedRuntimeIds.delete(runtimeId);
      throw error;
    }
  }

  return {
    activeRuntimeId,
    abort,
    continueTurn,
    send,
    submitUserChoice
  };
}

/**
 * @file useChatRuntimeEvents.ts
 * @description 应用级 ChatRuntime IPC 事件监听、路由和 renderer 请求处理。
 */
import type { AIServiceError, AIToolExecutionError, AIToolExecutionResult } from 'types/ai';
import type {
  ChatRuntimeBridgeRequestEvent,
  ChatRuntimeBridgeResult,
  ChatRuntimeConfirmationRequestEvent,
  ChatRuntimeErrorEvent,
  ChatRuntimeEventBase,
  ChatRuntimeHandlerResult,
  ChatRuntimeMessageDeletedEvent,
  ChatRuntimeMessageEvent,
  ChatRuntimeToolRequestEvent
} from 'types/chat-runtime';
import { onScopeDispose } from 'vue';
import type { ChatActorSystem } from '@/ai/chat/actorSystem';
import type { ChatWorkflowError } from '@/ai/chat/types';
import { executeToolCall } from '@/ai/tools/stream';
import { getElectronAPI } from '@/shared/platform/electron-api';

/** Runtime renderer 工具可透传错误码。 */
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

/**
 * 判断 Runtime 是否已经由 Actor system 接管。
 * @param actorSystem - Chat Actor system
 * @param runtimeId - Runtime ID
 * @returns 是否已注册
 */
function isManagedRuntime(actorSystem: ChatActorSystem, runtimeId: string): boolean {
  return actorSystem.actor.getSnapshot().context.runtimeRoutes.has(runtimeId);
}

/**
 * 判断错误码是否可作为工具稳定错误码。
 * @param code - 未知错误码
 * @returns 是否为稳定工具错误码
 */
function isRuntimeToolErrorCode(code: unknown): code is AIToolExecutionError['code'] {
  return typeof code === 'string' && RUNTIME_TOOL_ERROR_CODES.includes(code as AIToolExecutionError['code']);
}

/**
 * 将未知错误转换为工具失败结果。
 * @param toolName - 工具名称
 * @param error - 原始错误
 * @returns 工具失败结果
 */
function createToolFailure(toolName: string, error: unknown): AIToolExecutionResult {
  const rawCode = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;

  return {
    toolName,
    status: 'failure',
    error: {
      code: isRuntimeToolErrorCode(rawCode) ? rawCode : 'EXECUTION_FAILED',
      message: error instanceof Error ? error.message : String(error)
    }
  };
}

/**
 * 将 Bridge 错误转换为稳定结果。
 * @param error - 原始错误
 * @returns Bridge 失败结果
 */
function createBridgeFailure(error: unknown): ChatRuntimeBridgeResult {
  const rawCode = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;

  return {
    status: 'failure',
    error: {
      code: isRuntimeToolErrorCode(rawCode) ? rawCode : 'EXECUTION_FAILED',
      message: error instanceof Error ? error.message : String(error)
    }
  };
}

/**
 * 将 Runtime 错误转换为 Actor 流程错误。
 * @param error - Runtime 错误
 * @returns Actor 流程错误
 */
function createWorkflowError(error: AIServiceError): ChatWorkflowError {
  return {
    code: 'runtime_failed',
    message: error.message,
    cause: error
  };
}

/**
 * 确保 Runtime IPC 命令成功。
 * @param result - Runtime handler 结果
 */
function assertRuntimeResult(result: ChatRuntimeHandlerResult<void>): void {
  if (!result.ok) {
    throw new Error(result.error ?? 'ChatRuntime request failed');
  }
}

/**
 * 注册应用级 ChatRuntime 事件监听。
 * 未被 Actor system 注册的 Runtime 保留给迁移期间的旧 BChat listener。
 * @param actorSystem - 应用级 Chat Actor system
 */
export function useChatRuntimeEvents(actorSystem: ChatActorSystem): void {
  const electronAPI = getElectronAPI();

  /**
   * 判断事件是否属于已接管 Runtime。
   * @param event - Runtime 事件
   * @returns 是否接管
   */
  function shouldHandle(event: ChatRuntimeEventBase): boolean {
    return isManagedRuntime(actorSystem, event.runtimeId);
  }

  /** 发布 Runtime 消息新增事件。 */
  function handleMessageCreated(event: ChatRuntimeMessageEvent): void {
    if (shouldHandle(event)) actorSystem.emitSessionEvent(event.sessionId, { type: 'messageCreated', event });
  }

  /** 发布 Runtime 消息更新事件。 */
  function handleMessageUpdated(event: ChatRuntimeMessageEvent): void {
    if (shouldHandle(event)) actorSystem.emitSessionEvent(event.sessionId, { type: 'messageUpdated', event });
  }

  /** 发布 Runtime 消息删除事件。 */
  function handleMessageDeleted(event: ChatRuntimeMessageDeletedEvent): void {
    if (shouldHandle(event)) actorSystem.emitSessionEvent(event.sessionId, { type: 'messageDeleted', event });
  }

  /** 完成目标 Agent 并释放 Runtime。 */
  function handleComplete(event: ChatRuntimeEventBase): void {
    if (!shouldHandle(event)) return;
    actorSystem.send({ type: 'runtime.event', runtimeId: event.runtimeId, event: { type: 'runtime.completed', runtimeId: event.runtimeId } });
    actorSystem.sendToSession(event.sessionId, { type: 'session.completed' });
    actorSystem.unregisterRuntime(event.runtimeId);
  }

  /** 标记目标 Agent 失败并释放 Runtime。 */
  function handleError(event: ChatRuntimeErrorEvent): void {
    if (!shouldHandle(event)) return;
    actorSystem.send({
      type: 'runtime.event',
      runtimeId: event.runtimeId,
      event: { type: 'runtime.failed', runtimeId: event.runtimeId, error: createWorkflowError(event.error) }
    });
    actorSystem.sendToSession(event.sessionId, { type: 'session.failed', error: createWorkflowError(event.error) });
    actorSystem.emitSessionEvent(event.sessionId, { type: 'runtimeError', event });
    actorSystem.unregisterRuntime(event.runtimeId);
  }

  /** 执行已捕获的 renderer 工具。 */
  async function handleToolRequest(event: ChatRuntimeToolRequestEvent): Promise<void> {
    const capabilities = actorSystem.getRuntimeCapabilities(event.runtimeId);
    if (!shouldHandle(event) || !capabilities || actorSystem.hasSessionUISubscribers(event.sessionId)) return;

    try {
      const executed = await executeToolCall(
        { toolCallId: event.toolCallId, toolName: event.toolName, input: event.input },
        [...capabilities.tools],
        capabilities.getToolContext(),
        { runtimeId: event.runtimeId }
      );
      assertRuntimeResult(await electronAPI.chatRuntimeSubmitToolResult({ runtimeId: event.runtimeId, toolCallId: event.toolCallId, result: executed.result }));
    } catch (error: unknown) {
      assertRuntimeResult(
        await electronAPI.chatRuntimeSubmitToolResult({
          runtimeId: event.runtimeId,
          toolCallId: event.toolCallId,
          result: createToolFailure(event.toolName, error)
        })
      );
    }
  }

  /** 将确认请求路由到目标 Session UI 和 Agent。 */
  function handleConfirmationRequest(event: ChatRuntimeConfirmationRequestEvent): void {
    if (!shouldHandle(event)) return;
    actorSystem.send({
      type: 'runtime.event',
      runtimeId: event.runtimeId,
      event: { type: 'runtime.userChoiceRequired', runtimeId: event.runtimeId, interaction: 'confirmation' }
    });
    actorSystem.sendToSession(event.sessionId, { type: 'session.userChoiceRequired' });
    if (actorSystem.hasSessionUISubscribers(event.sessionId)) return;
    actorSystem.emitSessionEvent(event.sessionId, { type: 'confirmationRequested', event });
  }

  /** 执行已捕获的应用级 Bridge handler。 */
  async function handleBridgeRequest(event: ChatRuntimeBridgeRequestEvent): Promise<void> {
    const capabilities = actorSystem.getRuntimeCapabilities(event.runtimeId);
    if (!shouldHandle(event) || !capabilities || actorSystem.hasSessionUISubscribers(event.sessionId)) return;

    let result: ChatRuntimeBridgeResult;
    try {
      result = { status: 'success', data: await capabilities.handleBridgeRequest(event) };
    } catch (error: unknown) {
      result = createBridgeFailure(error);
    }
    assertRuntimeResult(await electronAPI.chatRuntimeSubmitBridgeResponse({ runtimeId: event.runtimeId, requestId: event.requestId, result }));
  }

  const disposers = [
    electronAPI.chatRuntimeOnMessageCreated(handleMessageCreated),
    electronAPI.chatRuntimeOnMessageUpdated(handleMessageUpdated),
    electronAPI.chatRuntimeOnMessageDeleted(handleMessageDeleted),
    electronAPI.chatRuntimeOnContextUsageUpdated((event) => {
      if (shouldHandle(event)) actorSystem.emitSessionEvent(event.sessionId, { type: 'contextUsageUpdated', event });
    }),
    electronAPI.chatRuntimeOnToolRequest((event) => {
      handleToolRequest(event).catch(() => undefined);
    }),
    electronAPI.chatRuntimeOnConfirmationRequested(handleConfirmationRequest),
    electronAPI.chatRuntimeOnBridgeRequested((event) => {
      handleBridgeRequest(event).catch(() => undefined);
    }),
    electronAPI.chatRuntimeOnComplete(handleComplete),
    electronAPI.chatRuntimeOnError(handleError)
  ];

  onScopeDispose((): void => {
    for (const dispose of disposers) dispose();
  });
}

/**
 * @file useRuntimeEvents.ts
 * @description 应用级 ChatRuntime IPC 事件监听、路由和 renderer 请求处理。
 */
import type {
  ChatRuntimeBridgeRequestEvent,
  ChatRuntimeBridgeResult,
  ChatRuntimeCompleteEvent,
  ChatRuntimeConfirmationRequestEvent,
  ChatRuntimeContextUsageEvent,
  ChatRuntimeErrorEvent,
  ChatRuntimeEventBase,
  ChatRuntimeMessageDeletedEvent,
  ChatRuntimeMessageEvent,
  ChatRuntimeToolCancelledEvent,
  ChatRuntimeToolRequestEvent
} from 'types/chat-runtime';
import { onScopeDispose } from 'vue';
import type { ChatActorSystem } from '@/ai/chat/actorSystem';
import { getRememberedRuntimeConfirmationDecision } from '@/ai/chat/policies/runtimeConfirmation';
import { normalizeToolConfirmationRequest } from '@/ai/tools/confirmation';
import { executeToolCall } from '@/ai/tools/stream';
import { getElectronAPI } from '@/shared/platform/electron-api';
import { useToolPermissionStore } from '@/stores/chat/toolPermission';
import { assertRuntimeResult, createBridgeFailure, createToolFailure, createWorkflowError, isManagedRuntime } from './error';

/**
 * 注册应用级 ChatRuntime 事件监听。
 * 未被 Actor system 注册的 Runtime 保留给迁移期间的旧 BChat listener。
 * @param actorSystem - 应用级 Chat Actor system
 */
export function useRuntimeEvents(actorSystem: ChatActorSystem): void {
  const electronAPI = getElectronAPI();
  const toolAbortControllers = new Map<string, AbortController>();

  /**
   * 创建 renderer 工具调用的稳定索引。
   * @param runtimeId - Runtime ID
   * @param toolCallId - 工具调用 ID
   * @returns 工具执行索引
   */
  function createToolAbortKey(runtimeId: string, toolCallId: string): string {
    return `${runtimeId}:${toolCallId}`;
  }
  const toolPermissionStore = useToolPermissionStore();

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
    if (!shouldHandle(event)) return;
    actorSystem.emitSessionEvent(event.sessionId, { type: 'messageCreated', event });
  }

  /** 发布 Runtime 消息更新事件。 */
  function handleMessageUpdated(event: ChatRuntimeMessageEvent): void {
    if (!shouldHandle(event)) return;
    actorSystem.emitSessionEvent(event.sessionId, { type: 'messageUpdated', event });
  }

  /** 发布 Runtime 消息删除事件。 */
  function handleMessageDeleted(event: ChatRuntimeMessageDeletedEvent): void {
    if (shouldHandle(event)) actorSystem.emitSessionEvent(event.sessionId, { type: 'messageDeleted', event });
  }

  /** 发布 Runtime 上下文用量更新事件。 */
  function handleContextUsage(event: ChatRuntimeContextUsageEvent): void {
    if (shouldHandle(event)) actorSystem.emitSessionEvent(event.sessionId, { type: 'contextUsageUpdated', event });
  }

  /** 完成目标 Agent 并释放 Runtime。 */
  function handleComplete(event: ChatRuntimeCompleteEvent): void {
    if (!shouldHandle(event)) return;
    if (event.reason === 'awaiting_user_input') {
      actorSystem.send({
        type: 'runtime.event',
        runtimeId: event.runtimeId,
        event: { type: 'runtime.userChoiceRequired', runtimeId: event.runtimeId, interaction: 'userChoice' }
      });
      actorSystem.sendToSession(event.sessionId, { type: 'session.userChoiceRequired', interaction: event.interaction });
      actorSystem.unregisterRuntime(event.runtimeId);
      return;
    }
    actorSystem.emitSessionEvent(event.sessionId, { type: 'runtimeCompleted', event });
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
    if (!shouldHandle(event) || !capabilities) return;
    const abortKey = createToolAbortKey(event.runtimeId, event.toolCallId);
    const abortController = new AbortController();
    toolAbortControllers.set(abortKey, abortController);

    try {
      const executed = await executeToolCall(
        { toolCallId: event.toolCallId, toolName: event.toolName, input: event.input },
        [...capabilities.tools],
        capabilities.getToolContext(),
        { runtimeId: event.runtimeId, abortSignal: abortController.signal }
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
    } finally {
      toolAbortControllers.delete(abortKey);
    }
  }

  /** 中止 main 已停止等待的 renderer 本地工具。 */
  function handleToolCancelled(event: ChatRuntimeToolCancelledEvent): void {
    if (!shouldHandle(event)) return;
    toolAbortControllers.get(createToolAbortKey(event.runtimeId, event.toolCallId))?.abort();
  }

  /** 将确认请求路由到目标 Session UI 和 Agent。 */
  async function handleConfirmationRequest(event: ChatRuntimeConfirmationRequestEvent): Promise<void> {
    if (!shouldHandle(event)) return;
    const normalizedEvent = { ...event, request: normalizeToolConfirmationRequest(event.request) };
    const rememberedDecision = getRememberedRuntimeConfirmationDecision(normalizedEvent.request, {
      session: toolPermissionStore.sessionToolPermissionGrants,
      always: toolPermissionStore.alwaysToolPermissionGrants
    });
    if (rememberedDecision) {
      assertRuntimeResult(
        await electronAPI.chatRuntimeSubmitConfirmation({
          runtimeId: event.runtimeId,
          confirmationId: event.confirmationId,
          decision: rememberedDecision
        })
      );
      return;
    }
    actorSystem.send({
      type: 'runtime.event',
      runtimeId: event.runtimeId,
      event: { type: 'runtime.userChoiceRequired', runtimeId: event.runtimeId, interaction: 'confirmation' }
    });
    actorSystem.sendToSession(event.sessionId, { type: 'session.userChoiceRequired' });
    actorSystem.emitSessionEvent(event.sessionId, { type: 'confirmationRequested', event: normalizedEvent });
  }

  /** 执行已捕获的应用级 Bridge handler。 */
  async function handleBridgeRequest(event: ChatRuntimeBridgeRequestEvent): Promise<void> {
    const capabilities = actorSystem.getRuntimeCapabilities(event.runtimeId);
    if (!shouldHandle(event) || !capabilities) return;

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
    electronAPI.chatRuntimeOnContextUsageUpdated(handleContextUsage),
    electronAPI.chatRuntimeOnToolRequest((event) => {
      handleToolRequest(event).catch(() => undefined);
    }),
    electronAPI.chatRuntimeOnToolCancelled(handleToolCancelled),
    electronAPI.chatRuntimeOnConfirmationRequested((event) => {
      handleConfirmationRequest(event).catch(() => undefined);
    }),
    electronAPI.chatRuntimeOnBridgeRequested((event) => {
      handleBridgeRequest(event).catch(() => undefined);
    }),
    electronAPI.chatRuntimeOnComplete(handleComplete),
    electronAPI.chatRuntimeOnError(handleError)
  ];

  onScopeDispose((): void => {
    for (const controller of toolAbortControllers.values()) controller.abort();
    toolAbortControllers.clear();
    for (const dispose of disposers) dispose();
  });
}

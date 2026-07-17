/**
 * @file useRuntimeRecovery.ts
 * @description 从主进程活跃 Runtime 快照重建 renderer Chat actor 与待处理请求。
 */
import type { ChatRuntimeHandlerResult, ChatRuntimeRecoveryPendingRequest, ChatRuntimeRecoverySnapshot } from 'types/chat-runtime';
import type { ChatActorSystem } from '@/ai/chat/actorSystem';
import type { RuntimeExecutionCapabilities } from '@/ai/chat/runtimeCapabilities';
import { logger } from '@/shared/logger';
import { getElectronAPI } from '@/shared/platform/electron-api';

/** 已恢复请求的稳定键。 */
function createPendingRequestKey(request: ChatRuntimeRecoveryPendingRequest): string {
  if (request.type === 'tool') return `${request.event.runtimeId}:tool:${request.event.toolCallId}`;
  if (request.type === 'confirmation') return `${request.event.runtimeId}:confirmation:${request.event.confirmationId}`;
  return `${request.event.runtimeId}:bridge:${request.event.requestId}`;
}

/** 解包 Runtime IPC 结果。 */
function unwrapRuntimeResult<T>(result: ChatRuntimeHandlerResult<T>): T {
  if (!result.ok || result.data === undefined) {
    throw new Error(result.error ?? 'ChatRuntime recovery request failed');
  }
  return result.data;
}

/** 为尚未挂载 BChat 的 Runtime 创建明确降级能力。 */
function createDegradedCapabilities(snapshot: ChatRuntimeRecoverySnapshot): RuntimeExecutionCapabilities {
  return {
    tools: [],
    descriptor: snapshot.capabilities,
    documentId: snapshot.capabilities?.documentId,
    getToolContext: (): undefined => undefined,
    handleBridgeRequest: async (): Promise<never> => {
      throw new Error('Renderer context is unavailable after reload');
    }
  };
}

/** 处理主进程仍在等待的 renderer 请求。 */
async function replayPendingRequest(actorSystem: ChatActorSystem, request: ChatRuntimeRecoveryPendingRequest): Promise<void> {
  const electronAPI = getElectronAPI();
  if (request.type === 'confirmation') {
    actorSystem.emitSessionEvent(request.event.sessionId, { type: 'confirmationRequested', event: request.event });
    return;
  }
  if (request.type === 'tool') {
    const result = await electronAPI.chatRuntimeSubmitToolResult({
      runtimeId: request.event.runtimeId,
      toolCallId: request.event.toolCallId,
      result: {
        toolName: request.event.toolName,
        status: 'failure',
        error: { code: 'EDITOR_UNAVAILABLE', message: 'Renderer reloaded before the local tool request completed' }
      }
    });
    if (!result.ok) throw new Error(result.error ?? 'Failed to resolve recovered renderer tool request');
    return;
  }

  const result = await electronAPI.chatRuntimeSubmitBridgeResponse({
    runtimeId: request.event.runtimeId,
    requestId: request.event.requestId,
    result: {
      status: 'failure',
      error: { code: 'EDITOR_UNAVAILABLE', message: 'Renderer reloaded before the bridge request completed' }
    }
  });
  if (!result.ok) throw new Error(result.error ?? 'Failed to resolve recovered bridge request');
}

/** 恢复一批 Runtime 快照并重放其待处理请求。 */
async function hydrateSnapshots(actorSystem: ChatActorSystem, snapshots: ChatRuntimeRecoverySnapshot[], replayedRequestKeys: Set<string>): Promise<void> {
  for (const snapshot of snapshots) {
    actorSystem.recoverRuntime(snapshot, createDegradedCapabilities(snapshot));
    for (const request of snapshot.pendingRequests) {
      const requestKey = createPendingRequestKey(request);
      if (replayedRequestKeys.has(requestKey)) continue;
      replayedRequestKeys.add(requestKey);
      // 请求必须按 Runtime 内原始顺序重放，避免 Bridge 与确认结果交叉。
      // eslint-disable-next-line no-await-in-loop
      await replayPendingRequest(actorSystem, request);
    }
  }
}

/**
 * 从主进程事实源恢复活跃 ChatRuntime。
 * @param actorSystem - 应用级 Chat actor system
 */
export async function recoverRuntimes(actorSystem: ChatActorSystem): Promise<void> {
  const electronAPI = getElectronAPI();
  const replayedRequestKeys = new Set<string>();
  const firstSnapshots = unwrapRuntimeResult(await electronAPI.chatRuntimeListActive());
  await hydrateSnapshots(actorSystem, firstSnapshots, replayedRequestKeys);

  // 第二次查询吸收首次查询期间新建或完成的 Runtime，避免恢复出过期路由。
  const finalSnapshots = unwrapRuntimeResult(await electronAPI.chatRuntimeListActive());
  await hydrateSnapshots(actorSystem, finalSnapshots, replayedRequestKeys);
  const finalRuntimeIds = new Set(finalSnapshots.map((snapshot): string => snapshot.runtimeId));
  for (const snapshot of firstSnapshots) {
    if (finalRuntimeIds.has(snapshot.runtimeId)) continue;
    for (const pendingRequest of snapshot.pendingRequests) {
      if (pendingRequest.type === 'confirmation') {
        actorSystem.clearSessionPendingInteraction(snapshot.sessionId, pendingRequest.event.confirmationId);
      }
    }
    actorSystem.sendToSession(snapshot.sessionId, { type: 'session.completed' });
    actorSystem.unregisterRuntime(snapshot.runtimeId);
  }
}

/** 在应用启动时异步恢复 ChatRuntime，失败只记录日志。 */
export function useRuntimeRecovery(actorSystem: ChatActorSystem): void {
  recoverRuntimes(actorSystem).catch((error: unknown): void => {
    logger.error(`[chat-runtime-recovery] ${error instanceof Error ? error.message : String(error)}`);
  });
}

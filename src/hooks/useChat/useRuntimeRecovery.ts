/**
 * @file useRuntimeRecovery.ts
 * @description 从主进程活跃 Runtime 快照重建 renderer Chat actor 与待处理请求。
 */
import type { ChatRuntimeHandlerResult, ChatRuntimeRecoveryPendingRequest, ChatRuntimeRecoverySnapshot } from 'types/chat-runtime';
import type { ChatActorSystem } from '@/ai/chat/actorSystem';
import type { RuntimeExecutionCapabilities } from '@/ai/chat/runtimeCapabilities';
import { CHAT_DRAFT_TAB_ID, createChatTabId } from '@/router/routes/helpers/chatRouteTab';
import { logger } from '@/shared/logger';
import { getElectronAPI } from '@/shared/platform/electron-api';
import type { ChatTabRuntimeController } from '@/stores/chat/tab';
import { useChatTabStore } from '@/stores/chat/tab';
import { useSettingStore } from '@/stores/ui/setting';
import type { Tab } from '@/stores/workspace/tabs';
import { useTabsStore } from '@/stores/workspace/tabs';
import { asyncTo } from '@/utils/asyncTo';

/** 恢复 Runtime 与顶部标签的临时绑定信息。 */
interface RecoveredRuntimeBinding {
  /** Runtime 所属标签 ID。 */
  tabId: string;
  /** 恢复流程创建的控制器；已挂载 BChat 提供控制器时为空。 */
  controller?: ChatTabRuntimeController;
}

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

/**
 * 为尚未挂载 BChat 的恢复 Runtime 创建终止控制器。
 * @param actorSystem - 应用级 Chat actor system
 * @param snapshot - 恢复 Runtime 快照
 * @param tabId - Runtime 所属顶部标签 ID
 * @returns 标签 Runtime 控制器
 */
function createRecoveredController(actorSystem: ChatActorSystem, snapshot: ChatRuntimeRecoverySnapshot, tabId: string): ChatTabRuntimeController {
  const runtimeStore = useChatTabStore();
  const electronAPI = getElectronAPI();
  let controller: ChatTabRuntimeController;

  /** 通过主进程终止恢复 Runtime，并同步 Session actor 状态。 */
  async function abort(): Promise<void> {
    actorSystem.sendToSession(snapshot.sessionId, { type: 'session.cancelRequested' });
    const [requestError, result] = await asyncTo(electronAPI.chatRuntimeAbort({ runtimeId: snapshot.runtimeId }));
    const abortError = requestError ?? (result && !result.ok ? new Error(result.error ?? '终止恢复的聊天任务失败') : undefined);
    if (abortError) {
      actorSystem.sendToSession(snapshot.sessionId, {
        type: 'session.cancelFailed',
        error: { code: 'cancel_failed', message: abortError.message, cause: abortError }
      });
      throw abortError;
    }

    actorSystem.sendToSession(snapshot.sessionId, { type: 'session.runtimeCancelled' });
    actorSystem.unregisterRuntime(snapshot.runtimeId);
    runtimeStore.setStatus(tabId, 'idle');
    runtimeStore.unregisterController(tabId, controller);
  }

  controller = { abort };
  return controller;
}

/**
 * 识别重启前仍由唯一草稿标签持有的 Runtime。
 * @param snapshots - 当前活跃 Runtime 快照
 * @returns 可明确归属 chat:new 的 Runtime ID
 */
function findDraftRuntimeId(snapshots: ChatRuntimeRecoverySnapshot[]): string | undefined {
  const { tabs } = useTabsStore();
  if (!tabs.some((tab: Tab): boolean => tab.id === CHAT_DRAFT_TAB_ID)) return undefined;

  const sidebarSessionId = useSettingStore().chatSidebarActiveSessionId;
  const candidates = snapshots.filter((snapshot: ChatRuntimeRecoverySnapshot): boolean => {
    if (snapshot.sessionId === sidebarSessionId) return false;
    return !tabs.some((tab: Tab): boolean => tab.id === createChatTabId(snapshot.sessionId));
  });
  return candidates.length === 1 ? candidates[0]?.runtimeId : undefined;
}

/**
 * 将恢复 Runtime 同步到顶部聊天标签状态和终止控制器。
 * @param actorSystem - 应用级 Chat actor system
 * @param snapshot - 恢复 Runtime 快照
 * @param bindings - 本轮恢复识别的 Runtime 标签绑定
 * @param draftRuntimeId - 可明确归属唯一草稿标签的 Runtime ID
 */
function syncRecoveredRuntime(
  actorSystem: ChatActorSystem,
  snapshot: ChatRuntimeRecoverySnapshot,
  bindings: Map<string, RecoveredRuntimeBinding>,
  draftRuntimeId?: string
): void {
  const runtimeStore = useChatTabStore();
  const { tabs } = useTabsStore();
  const persistedTabId = createChatTabId(snapshot.sessionId);
  const knownTabId = bindings.get(snapshot.runtimeId)?.tabId ?? (snapshot.runtimeId === draftRuntimeId ? CHAT_DRAFT_TAB_ID : undefined);
  const tabId = knownTabId ?? (tabs.some((tab: Tab): boolean => tab.id === persistedTabId) ? persistedTabId : undefined);
  if (!tabId) return;

  runtimeStore.ensureTab(tabId, snapshot.sessionId);
  const waitingForConfirmation = snapshot.pendingRequests.some((request: ChatRuntimeRecoveryPendingRequest): boolean => request.type === 'confirmation');
  runtimeStore.setStatus(tabId, waitingForConfirmation ? 'waiting' : 'running');

  // 已挂载的 BChat 控制器包含完整可见消息同步能力，恢复控制器不得覆盖它。
  if (runtimeStore.controllers.has(tabId)) {
    if (!bindings.has(snapshot.runtimeId)) bindings.set(snapshot.runtimeId, { tabId });
    return;
  }
  const controller = createRecoveredController(actorSystem, snapshot, tabId);
  runtimeStore.registerController(tabId, controller);
  bindings.set(snapshot.runtimeId, { tabId, controller });
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

/**
 * 恢复一批 Runtime 快照并重放其待处理请求。
 * @param actorSystem - 应用级 Chat actor system
 * @param snapshots - 当前活跃 Runtime 快照
 * @param replayedRequestKeys - 已重放请求的稳定键
 * @param bindings - 本轮恢复识别的 Runtime 标签绑定
 * @param draftRuntimeId - 可明确归属唯一草稿标签的 Runtime ID
 */
async function hydrateSnapshots(
  actorSystem: ChatActorSystem,
  snapshots: ChatRuntimeRecoverySnapshot[],
  replayedRequestKeys: Set<string>,
  bindings: Map<string, RecoveredRuntimeBinding>,
  draftRuntimeId?: string
): Promise<void> {
  for (const snapshot of snapshots) {
    actorSystem.recoverRuntime(snapshot, createDegradedCapabilities(snapshot));
    syncRecoveredRuntime(actorSystem, snapshot, bindings, draftRuntimeId);
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
  const bindings = new Map<string, RecoveredRuntimeBinding>();
  const firstSnapshots = unwrapRuntimeResult(await electronAPI.chatRuntimeListActive());
  await hydrateSnapshots(actorSystem, firstSnapshots, replayedRequestKeys, bindings, findDraftRuntimeId(firstSnapshots));

  // 第二次查询吸收首次查询期间新建或完成的 Runtime，避免恢复出过期路由。
  const finalSnapshots = unwrapRuntimeResult(await electronAPI.chatRuntimeListActive());
  await hydrateSnapshots(actorSystem, finalSnapshots, replayedRequestKeys, bindings, findDraftRuntimeId(finalSnapshots));
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
    const binding = bindings.get(snapshot.runtimeId);
    if (binding?.controller) {
      useChatTabStore().unregisterController(binding.tabId, binding.controller);
    }
    if (binding) useChatTabStore().markCompleted(binding.tabId, false);
  }
}

/** 在应用启动时异步恢复 ChatRuntime，失败只记录日志。 */
export function useRuntimeRecovery(actorSystem: ChatActorSystem): void {
  recoverRuntimes(actorSystem).catch((error: unknown): void => {
    logger.error(`[chat-runtime-recovery] ${error instanceof Error ? error.message : String(error)}`);
  });
}

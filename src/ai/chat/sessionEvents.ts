/**
 * @file sessionEvents.ts
 * @description 按会话分发 UI 事件，并仅保留待处理确认交互。
 */
import type {
  ChatRuntimeConfirmationRequestEvent,
  ChatRuntimeContextUsageEvent,
  ChatRuntimeErrorEvent,
  ChatRuntimeMessageDeletedEvent,
  ChatRuntimeMessageEvent
} from 'types/chat-runtime';

/**
 * Session UI 事件。
 */
export type ChatSessionUIEvent =
  | { type: 'messageCreated'; event: ChatRuntimeMessageEvent }
  | { type: 'messageUpdated'; event: ChatRuntimeMessageEvent }
  | { type: 'messageDeleted'; event: ChatRuntimeMessageDeletedEvent }
  | { type: 'contextUsageUpdated'; event: ChatRuntimeContextUsageEvent }
  | { type: 'confirmationRequested'; event: ChatRuntimeConfirmationRequestEvent }
  | { type: 'runtimeError'; event: ChatRuntimeErrorEvent };

/** Session UI 事件监听器。 */
export type ChatSessionUIEventListener = (event: ChatSessionUIEvent) => void;

/**
 * Session UI 事件总线。
 */
export interface ChatSessionEventBus {
  /** 订阅指定会话事件 */
  subscribe: (sessionId: string, listener: ChatSessionUIEventListener) => () => void;
  /** 向指定会话发布事件 */
  emit: (sessionId: string, event: ChatSessionUIEvent) => void;
  /** 清理指定会话监听器 */
  clearSession: (sessionId: string) => void;
  /** 判断指定会话是否有可见 UI 订阅 */
  hasSubscribers: (sessionId: string) => boolean;
  /** 清除已处理的待确认交互 */
  clearPendingInteraction: (sessionId: string, confirmationId: string) => void;
  /** 清理全部监听器 */
  clear: () => void;
}

/**
 * 创建无事件缓存的 Session UI 总线。
 * @returns Session UI 事件总线
 */
export function createChatSessionEventBus(): ChatSessionEventBus {
  const listenersBySession = new Map<string, Set<ChatSessionUIEventListener>>();
  const pendingInteractionsBySession = new Map<string, Extract<ChatSessionUIEvent, { type: 'confirmationRequested' }>>();

  return {
    subscribe(sessionId: string, listener: ChatSessionUIEventListener): () => void {
      const listeners = listenersBySession.get(sessionId) ?? new Set<ChatSessionUIEventListener>();
      listeners.add(listener);
      listenersBySession.set(sessionId, listeners);
      const pendingInteraction = pendingInteractionsBySession.get(sessionId);
      if (pendingInteraction) {
        listener(pendingInteraction);
      }

      return (): void => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersBySession.delete(sessionId);
        }
      };
    },
    emit(sessionId: string, event: ChatSessionUIEvent): void {
      if (event.type === 'confirmationRequested') {
        pendingInteractionsBySession.set(sessionId, event);
      }
      for (const listener of [...(listenersBySession.get(sessionId) ?? [])]) {
        listener(event);
      }
    },
    clearSession(sessionId: string): void {
      listenersBySession.delete(sessionId);
      pendingInteractionsBySession.delete(sessionId);
    },
    hasSubscribers(sessionId: string): boolean {
      return (listenersBySession.get(sessionId)?.size ?? 0) > 0;
    },
    clearPendingInteraction(sessionId: string, confirmationId: string): void {
      const pendingInteraction = pendingInteractionsBySession.get(sessionId);
      if (pendingInteraction?.event.confirmationId === confirmationId) {
        pendingInteractionsBySession.delete(sessionId);
      }
    },
    clear(): void {
      listenersBySession.clear();
      pendingInteractionsBySession.clear();
    }
  };
}

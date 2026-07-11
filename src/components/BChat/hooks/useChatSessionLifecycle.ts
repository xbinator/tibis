/**
 * @file useChatSessionLifecycle.ts
 * @description 管理 BChat 草稿会话、历史加载、会话切换与自动命名生命周期。
 */
import type { Message } from '../utils/types';
import type { ChatSession } from 'types/chat';
import type { ComputedRef, Ref } from 'vue';
import { computed, nextTick, ref, watch } from 'vue';
import { useChatSessionStore } from '@/stores/chat/session';
import { useAutoName } from './useAutoName';
import { useChatHistory } from './useChatHistory';

/**
 * Chat Session 生命周期依赖项。
 */
interface UseChatSessionLifecycleOptions {
  /** 父级指定的会话 ID */
  sessionId: Ref<string | null>;
  /** 当前聊天是否忙碌 */
  isLoading: () => boolean;
  /** 释放当前确认请求 */
  disposeConfirmation: () => void;
  /** 重置用量面板 */
  resetUsagePanel: () => void;
  /** 重置 Runtime 上下文用量 */
  resetRuntimeContextUsage: () => void;
  /** 聚焦输入编辑器 */
  focusInput: () => void;
  /** 检查是否存在待回答用户选择 */
  hasPendingUserChoice: (messages: Message[]) => boolean;
  /** 通知新会话已创建 */
  onSessionCreated: (session: ChatSession) => void;
  /** 通知自动标题已持久化 */
  onSessionTitlePersisted: (sessionId: string, title: string) => void;
  /** 通知已进入草稿会话 */
  onDraftSessionCreated: () => void;
}

/**
 * Chat Session 生命周期返回值。
 */
interface UseChatSessionLifecycleReturn extends ReturnType<typeof useChatHistory> {
  /** 当前实际运行会话 ID */
  activeSessionId: ComputedRef<string | null>;
  /** BChat 为草稿创建的会话 ID */
  createdSessionId: Ref<string | null>;
  /** 自动命名使用的会话镜像 */
  currentSessionForAutoName: Ref<{ id: string; title: string } | undefined>;
  /** 确保存在可持久化会话 */
  ensureActiveSession: (title: string) => Promise<string>;
  /** 创建新的草稿会话 */
  createDraftSession: () => Promise<void>;
  /** 加载当前会话更多历史 */
  handleLoadHistory: () => Promise<void>;
  /** 捕获自动命名快照 */
  captureAutoNameSnapshot: ReturnType<typeof useAutoName>['captureSnapshot'];
  /** 调度自动命名 */
  scheduleAutoName: ReturnType<typeof useAutoName>['scheduleAutoName'];
}

/**
 * 管理当前 BChat 的会话生命周期。
 * @param options - 会话切换与 UI 回调
 * @returns 会话 ID、历史消息和自动命名能力
 */
export function useChatSessionLifecycle(options: UseChatSessionLifecycleOptions): UseChatSessionLifecycleReturn {
  const chatStore = useChatSessionStore();
  const createdSessionId = ref<string | null>(null);
  const currentSessionForAutoName = ref<{ id: string; title: string }>();
  const activeSessionId = computed<string | null>(() => options.sessionId.value ?? createdSessionId.value);
  const history = useChatHistory();

  /** 重置新会话草稿状态。 */
  async function resetDraftSessionState(): Promise<void> {
    options.disposeConfirmation();
    createdSessionId.value = null;
    currentSessionForAutoName.value = undefined;
    options.resetRuntimeContextUsage();
    options.resetUsagePanel();
    history.setLoadedMessages([]);
    history.hasMoreHistory.value = false;
    await nextTick();
    options.focusInput();
  }

  /** 加载指定会话消息。 */
  async function loadSessionMessages(sessionId: string): Promise<void> {
    options.disposeConfirmation();
    options.resetUsagePanel();
    options.resetRuntimeContextUsage();
    history.hasMoreHistory.value = false;
    history.setLoadedMessages(await chatStore.getSessionMessages(sessionId));
  }

  watch(
    options.sessionId,
    async (nextSessionId: string | null): Promise<void> => {
      if (nextSessionId && nextSessionId === createdSessionId.value) {
        createdSessionId.value = null;
        return;
      }
      if (!nextSessionId) {
        await resetDraftSessionState();
        return;
      }

      createdSessionId.value = null;
      currentSessionForAutoName.value = undefined;
      await loadSessionMessages(nextSessionId);
    },
    { immediate: true }
  );

  /** 确保当前发送动作存在可持久化会话。 */
  async function ensureActiveSession(title: string): Promise<string> {
    if (activeSessionId.value) {
      return activeSessionId.value;
    }

    const session = await chatStore.createSession('assistant', { title });
    createdSessionId.value = session.id;
    currentSessionForAutoName.value = session;
    options.onSessionCreated(session);
    return session.id;
  }

  /** 进入新的草稿会话。 */
  async function createDraftSession(): Promise<void> {
    if (options.isLoading()) return;
    await resetDraftSessionState();
    options.onDraftSessionCreated();
  }

  /** 加载当前会话的更早历史。 */
  async function handleLoadHistory(): Promise<void> {
    const sessionId = activeSessionId.value;
    if (!sessionId) return;
    await history.loadHistory(sessionId);
  }

  const { captureSnapshot, scheduleAutoName } = useAutoName({
    getCurrentSession: (): { id: string; title: string } | undefined => currentSessionForAutoName.value,
    getFirstRoundContent: (nextMessage: Pick<Message, 'content'>) => {
      if (options.hasPendingUserChoice(history.messages.value)) {
        return null;
      }

      const userMessages = history.messages.value.filter((item: Message): boolean => item.role === 'user');
      const assistantMessages = history.messages.value.filter((item: Message): boolean => item.role === 'assistant');
      if (userMessages.length !== 1 || assistantMessages.length !== 1) return null;
      return { userMessage: userMessages[0].content, aiResponse: nextMessage.content };
    },
    onTitlePersisted: options.onSessionTitlePersisted
  });

  return {
    ...history,
    activeSessionId,
    createdSessionId,
    currentSessionForAutoName,
    ensureActiveSession,
    createDraftSession,
    handleLoadHistory,
    captureAutoNameSnapshot: captureSnapshot,
    scheduleAutoName
  };
}

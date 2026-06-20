/**
 * @file useChatSession.ts
 * @description ChatSider 会话选择状态管理。
 */
import type { ChatSession } from 'types/chat';
import type { Ref } from 'vue';
import { ref } from 'vue';
import { useSettingStore } from '@/stores/ui/setting';

/**
 * ChatSider 会话 hook 依赖项。
 */
interface UseChatSessionOptions {
  /** 当前聊天运行时是否忙碌。 */
  isChatLoading: () => boolean;
}

/**
 * ChatSider 会话选择状态。
 */
interface ChatSessionApi {
  /** 当前激活会话对象，用于标题展示。 */
  currentSession: Ref<ChatSession | undefined>;
  /** 会话选择加载状态。 */
  loading: Ref<boolean>;
  /** 切换当前激活会话。 */
  switchSession: (sessionId: string) => Promise<void>;
  /** 进入新会话草稿态。 */
  createDraftSession: () => Promise<void>;
  /** 当前会话被删除后的外层状态同步。 */
  handleDeletedSession: (sessionId: string) => void;
  /** 同步当前会话对象。 */
  setCurrentSession: (session: ChatSession | undefined) => void;
}

/**
 * 管理默认布局聊天侧栏的会话选择状态。
 * @param options - hook 依赖项
 * @returns 会话 API
 */
export function useChatSession(options: UseChatSessionOptions): ChatSessionApi {
  const settingStore = useSettingStore();

  /** 当前激活会话对象。 */
  const currentSession = ref<ChatSession | undefined>(undefined);
  /** 会话选择加载状态。 */
  const loading = ref(false);

  /**
   * 同步当前会话对象。
   * @param session - 当前会话对象
   */
  function setCurrentSession(session: ChatSession | undefined): void {
    currentSession.value = session;
  }

  /**
   * 判断侧栏会话操作是否应被拒绝。
   * @returns 是否应拒绝会话操作
   */
  function shouldRejectSessionAction(): boolean {
    return options.isChatLoading() || loading.value;
  }

  /**
   * 切换当前激活会话。
   * @param sessionId - 目标会话 ID
   */
  async function switchSession(sessionId: string): Promise<void> {
    if (shouldRejectSessionAction()) return;
    if (sessionId === settingStore.chatSidebarActiveSessionId) return;

    settingStore.setChatSidebarActiveSessionId(sessionId);
  }

  /**
   * 进入新会话草稿态。
   */
  async function createDraftSession(): Promise<void> {
    if (shouldRejectSessionAction()) return;

    settingStore.setChatSidebarActiveSessionId(null);
    currentSession.value = undefined;
  }

  /**
   * 同步会话删除后的外层状态。
   * @param sessionId - 被删除的会话 ID
   */
  function handleDeletedSession(sessionId: string): void {
    if (shouldRejectSessionAction()) return;
    if (sessionId !== settingStore.chatSidebarActiveSessionId) return;

    settingStore.setChatSidebarActiveSessionId(null);
    currentSession.value = undefined;
  }

  return {
    currentSession,
    loading,
    switchSession,
    createDraftSession,
    handleDeletedSession,
    setCurrentSession
  };
}

/**
 * @file useChatOwner.ts
 * @description 将聊天标签与 Runtime 记录归一为统一的会话 Owner。
 */
import { CHAT_DRAFT_TAB_ID, createChatPath, findChatTab } from '@/router/routes/helpers/chatRouteTab';
import { useChatTabStore } from '@/stores/chat/tab';
import type { Tab } from '@/stores/workspace/tabs';
import { useTabsStore } from '@/stores/workspace/tabs';

/**
 * 标准聊天会话 Owner。
 */
export interface ChatOwner {
  /** Owner 标签 ID。 */
  tabId: string;
  /** Owner 应导航到的路径。 */
  path: string;
  /** 当前真实会话 ID。 */
  sessionId?: string;
}

/**
 * 聊天会话 Owner 查询 API。
 */
interface ChatOwnerApi {
  /** 查找草稿或持久化会话 Owner。 */
  findOwner: (sessionId?: string | null) => ChatOwner | undefined;
}

/**
 * 创建标准 Owner 对象。
 * @param tabId - Owner 标签 ID
 * @param path - Owner 导航路径
 * @param sessionId - 可选真实会话 ID
 * @returns 标准 Owner
 */
function createOwner(tabId: string, path: string, sessionId?: string | null): ChatOwner {
  return {
    tabId,
    path,
    ...(sessionId ? { sessionId } : {})
  };
}

/**
 * 提供统一的聊天会话 Owner 查询。
 * @returns Owner 查询 API
 */
export function useChatOwner(): ChatOwnerApi {
  const tabsStore = useTabsStore();
  const runtimeStore = useChatTabStore();

  /**
   * 查找草稿或持久化会话 Owner。
   * @param sessionId - 会话 ID；空值表示唯一草稿
   * @returns 标准 Owner，不存在时返回 undefined
   */
  function findOwner(sessionId?: string | null): ChatOwner | undefined {
    const runtimeOwner = sessionId ? runtimeStore.findOwner(sessionId) : undefined;
    if (runtimeOwner) {
      const ownerTab = tabsStore.tabs.find((tab: Tab): boolean => tab.id === runtimeOwner.tabId);
      const ownerPath = ownerTab?.path ?? (runtimeOwner.tabId === CHAT_DRAFT_TAB_ID ? createChatPath() : createChatPath(sessionId));
      return createOwner(runtimeOwner.tabId, ownerPath, runtimeOwner.sessionId);
    }

    const ownerTab = findChatTab(tabsStore.tabs, sessionId);
    return ownerTab ? createOwner(ownerTab.id, ownerTab.path, sessionId) : undefined;
  }

  return { findOwner };
}

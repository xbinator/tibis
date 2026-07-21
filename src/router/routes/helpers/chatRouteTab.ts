/**
 * @file chatRouteTab.ts
 * @description 统一解析聊天页路径、标签身份与会话归属。
 */
import type { Tab } from '@/stores/workspace/tabs';

/** 空白聊天页固定标签 ID。 */
export const CHAT_DRAFT_TAB_ID = 'chat:new';
/** 聊天标签 ID 前缀。 */
export const CHAT_TAB_PREFIX = 'chat:';

/**
 * 构建聊天页路径。
 * @param sessionId - 持久化会话 ID，空值表示草稿页
 * @returns 聊天页绝对路径
 */
export function createChatPath(sessionId?: string | null): string {
  return sessionId ? `/chat/${encodeURIComponent(sessionId)}` : '/chat';
}

/**
 * 构建聊天标签 ID。
 * @param sessionId - 持久化会话 ID，空值表示草稿页
 * @returns 聊天标签 ID
 */
export function createChatTabId(sessionId?: string | null): string {
  return sessionId ? `${CHAT_TAB_PREFIX}${sessionId}` : CHAT_DRAFT_TAB_ID;
}

/**
 * 判断标签是否属于聊天页。
 * @param tab - 待判断标签
 * @returns 是否为聊天标签
 */
export function isChatTab(tab: Pick<Tab, 'id'>): boolean {
  return tab.id.startsWith(CHAT_TAB_PREFIX);
}

/**
 * 从聊天路径解析会话 ID。
 * @param path - 标签或路由路径
 * @returns 会话 ID；草稿或非聊天路径返回 undefined
 */
export function resolveChatSessionId(path: string): string | undefined {
  const matched = /^\/chat\/([^/?#]+)(?:[?#].*)?$/u.exec(path);
  if (!matched?.[1]) return undefined;

  try {
    return decodeURIComponent(matched[1]);
  } catch {
    return matched[1];
  }
}

/**
 * 查找指定聊天会话对应的标签。
 * @param tabs - 当前标签列表
 * @param sessionId - 会话 ID；空值查找草稿标签
 * @returns 命中的聊天标签
 */
export function findChatTab<T extends Pick<Tab, 'id'>>(tabs: T[], sessionId?: string | null): T | undefined {
  const targetId = createChatTabId(sessionId);

  return tabs.find((tab: T): boolean => tab.id === targetId);
}

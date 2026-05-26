/**
 * @file chat.ts
 * @description 聊天会话和消息持久化存储。
 */
import type { AIUsage } from 'types/ai';
import type { ChatMessageHistoryCursor, ChatMessageRecord, ChatSession, ChatSessionType, PaginatedSessionsResult, SessionPaginationParams } from 'types/chat';
import { defineStore } from 'pinia';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { is, type PersistableMessage } from '@/components/BChatSidebar/utils/messageHelper';
import type { Message } from '@/components/BChatSidebar/utils/types';
import { getElectronAPI, unwrap } from '@/shared/platform/electron-api';

/**
 * 将可持久化的侧边栏消息转换为存储记录。
 * @param sessionId - 目标聊天会话 ID。
 * @param message - 可持久化的消息数据。
 * @returns 可存储的聊天消息记录。
 */
function toRecordMessage(sessionId: string, message: PersistableMessage): ChatMessageRecord {
  const { id, role, content, parts, thinking, files, usage, compression, createdAt = dayjs().toISOString() } = message;

  // Deep-clone to strip Vue reactive Proxy objects before passing through Electron IPC.
  return JSON.parse(JSON.stringify({ sessionId, id, role, content, parts, thinking, files, usage, compression, createdAt }));
}

export const useChatSessionStore = defineStore('chat', {
  actions: {
    /**
     * 加载会话的聊天消息，可选择使用历史游标。
     * @param sessionId - 要加载的会话 ID。
     * @param cursor - 可选的历史游标。
     * @returns 已完成的聊天消息，可直接用于 UI 展示。
     */
    async getSessionMessages(sessionId: string, cursor?: ChatMessageHistoryCursor): Promise<Message[]> {
      const result = await getElectronAPI().chatMessageList(sessionId, cursor);
      const messages = unwrap(result);

      return messages.map((message) => ({ ...message, finished: true }));
    },

    /**
     * 按类型加载会话，用于历史导航，支持基于游标的分页。
     * @param type - 会话类型过滤器。
     * @param pagination - 可选的分页参数，用于基于游标的加载。
     * @returns 分页会话结果，包含会话列表、是否有更多数据标志和下一个游标。
     */
    async getSessions(type: ChatSessionType, pagination?: SessionPaginationParams): Promise<PaginatedSessionsResult> {
      const result = await getElectronAPI().chatSessionList(type, pagination);
      return unwrap(result);
    },

    /**
     * 读取单个会话的已持久化使用量。
     * @param sessionId - 要查看的会话 ID。
     * @returns 已持久化的使用量总计，如果会话没有使用量则返回 undefined。
     */
    async getSessionUsage(sessionId: string): Promise<AIUsage | undefined> {
      const result = await getElectronAPI().chatSessionUsageGet(sessionId);
      return unwrap(result);
    },

    /**
     * 创建新的聊天会话并立即持久化。
     * @param type - 要创建的会话类型。
     * @param options - 可选的会话元数据。
     * @returns 创建的会话记录。
     */
    async createSession(type: ChatSessionType, { title = '新会话' }: { title?: string } = {}): Promise<ChatSession> {
      const now = dayjs().toISOString();
      const session: ChatSession = { id: nanoid(), type, title, createdAt: now, updatedAt: now, lastMessageAt: now };

      const result = await getElectronAPI().chatSessionCreate(session);
      unwrap(result);

      return session;
    },

    /**
     * 持久化单条消息及其使用量元数据（如果可用）。
     * 级联更新（lastMessageAt + usage）在主进程事务内完成。
     * @param sessionId - 要更新的会话 ID。
     * @param message - 要持久化的消息。
     */
    async addSessionMessage(sessionId: string | null, message: Message): Promise<void> {
      if (!sessionId) return;
      if (!is.persistableMessage(message)) return;

      const record = toRecordMessage(sessionId, message);
      const result = await getElectronAPI().chatMessageAdd(record);
      unwrap(result);
    },

    /**
     * 替换会话的所有已持久化消息，并重新计算汇总使用量。
     * DELETE + INSERT + usage/lastMessageAt 在主进程事务内原子完成。
     * @param sessionId - 要更新的会话 ID。
     * @param messages - 要持久化的完整消息列表。
     */
    async setSessionMessages(sessionId: string | null | undefined, messages: Message[]): Promise<void> {
      if (!sessionId) return;

      const persistableMessages = messages.filter(is.persistableMessage);
      const records = persistableMessages.map((message) => toRecordMessage(sessionId, message));

      const result = await getElectronAPI().chatMessageSetAll(sessionId, records);
      unwrap(result);
    },

    /**
     * 仅更新会话标题，保持排序和使用量元数据不变。
     * @param sessionId - 要更新的会话 ID。
     * @param title - 新的会话标题。
     */
    async updateSessionTitle(sessionId: string, title: string): Promise<void> {
      const result = await getElectronAPI().chatSessionUpdateTitle(sessionId, title);
      unwrap(result);
    },

    /**
     * 删除会话及其已持久化的消息。
     * @param sessionId - 要删除的会话 ID。
     */
    async deleteSession(sessionId: string): Promise<void> {
      const result = await getElectronAPI().chatSessionDelete(sessionId);
      unwrap(result);
    }
  }
});

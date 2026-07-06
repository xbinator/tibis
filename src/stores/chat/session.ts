/**
 * @file chat.ts
 * @description 聊天会话和消息持久化存储。
 */
import type { AIUsage } from 'types/ai';
import type { ChatMessageHistoryCursor, ChatMessageRecord, ChatSession, ChatSessionType, PaginatedSessionsResult, SessionPaginationParams } from 'types/chat';
import { toRaw } from 'vue';
import { defineStore } from 'pinia';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { recoverInterruptedAssistantDrafts } from '@/components/BChat/utils/interruptedDraftRecovery';
import { is, type PersistableMessage } from '@/components/BChat/utils/messageHelper';
import type { Message } from '@/components/BChat/utils/types';
import { getElectronAPI, unwrap } from '@/shared/platform/electron-api';
import { isDatabaseInitializationRaceError, retryDuringDatabaseInitialization } from '@/shared/storage/utils/database';
import { useTodoStore } from './todo';

/**
 * 将值转换为 Electron IPC 可克隆的纯数据。
 * @param value - 待转换值
 * @returns 去除 Vue Proxy 后的可克隆数据
 */
function toCloneableData<T>(value: T): T {
  if (value === undefined) return value;

  const rawValue = toRaw(value);
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(rawValue) as T;
    } catch {
      // 嵌套 Vue Proxy 无法 structuredClone 时，回退到 JSON 纯数据。
    }
  }

  return JSON.parse(JSON.stringify(rawValue)) as T;
}

/**
 * 将可持久化的侧边栏消息转换为存储记录。
 * @param sessionId - 目标聊天会话 ID。
 * @param message - 可持久化的消息数据。
 * @returns 可存储的聊天消息记录。
 */
function toRecordMessage(sessionId: string, message: PersistableMessage): ChatMessageRecord {
  const { id, role, content, parts, thinking, files, usage, compression, createdAt = dayjs().toISOString(), loading, finished } = message;

  // Deep-clone to strip Vue reactive Proxy objects before passing through Electron IPC.
  return toCloneableData({ sessionId, id, role, content, parts, thinking, files, usage, compression, createdAt, loading, finished });
}

/**
 * 将持久化记录恢复为侧边栏消息。
 * 旧记录没有 finished/loading 字段时按已完成历史消息处理。
 * @param record - 持久化聊天消息记录。
 * @returns 侧边栏消息。
 */
function fromRecordMessage(record: ChatMessageRecord): Message {
  return {
    ...record,
    loading: record.loading ?? false,
    finished: record.finished ?? true
  };
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
      try {
        const messages = await retryDuringDatabaseInitialization(async () => {
          // 深拷贝以剥离 Vue 响应式 Proxy，否则 Electron IPC 结构化克隆会失败
          const plainCursor = cursor ? toCloneableData(cursor) : undefined;
          const result = await getElectronAPI().chatMessageList(sessionId, plainCursor);
          return unwrap(result);
        });

        const loadedMessages = messages.map(fromRecordMessage);
        const recoveryResult = recoverInterruptedAssistantDrafts(loadedMessages);

        if (recoveryResult.recovered) {
          await Promise.all([
            ...recoveryResult.recoveredMessages.map((message) => this.updateSessionMessage(sessionId, message)),
            ...recoveryResult.createdMessages.map((message) => this.addSessionMessage(sessionId, message))
          ]);
        }

        return recoveryResult.messages;
      } catch (error: unknown) {
        if (isDatabaseInitializationRaceError(error)) {
          return [];
        }

        throw error;
      }
    },

    /**
     * 按类型加载会话，用于历史导航，支持基于游标的分页。
     * @param type - 会话类型过滤器。
     * @param pagination - 可选的分页参数，用于基于游标的加载。
     * @returns 分页会话结果，包含会话列表、是否有更多数据标志和下一个游标。
     */
    async getSessions(type: ChatSessionType, pagination?: SessionPaginationParams): Promise<PaginatedSessionsResult> {
      try {
        return await retryDuringDatabaseInitialization(async () => {
          // 深拷贝以剥离 Vue 响应式 Proxy，否则 Electron IPC 结构化克隆会失败
          const plainPagination = pagination ? toCloneableData(pagination) : undefined;
          const result = await getElectronAPI().chatSessionList(type, plainPagination);
          return unwrap(result);
        });
      } catch (error: unknown) {
        if (isDatabaseInitializationRaceError(error)) {
          return { items: [], hasMore: false };
        }

        throw error;
      }
    },

    /**
     * 读取单个会话的已持久化使用量。
     * @param sessionId - 要查看的会话 ID。
     * @returns 已持久化的使用量总计，如果会话没有使用量则返回 undefined。
     */
    async getSessionUsage(sessionId: string): Promise<AIUsage | undefined> {
      try {
        return await retryDuringDatabaseInitialization(async () => {
          const result = await getElectronAPI().chatSessionUsageGet(sessionId);
          return unwrap(result);
        });
      } catch (error: unknown) {
        if (isDatabaseInitializationRaceError(error)) {
          return undefined;
        }

        throw error;
      }
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

      await retryDuringDatabaseInitialization(async () => {
        const result = await getElectronAPI().chatSessionCreate(session);
        unwrap(result);
      });

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
      await retryDuringDatabaseInitialization(async () => {
        const result = await getElectronAPI().chatMessageAdd(record);
        unwrap(result);
      });
    },

    /**
     * 更新或创建单条消息，不累计会话用量。
     * 用于流式 assistant 草稿持久化和硬中断恢复回写。
     * @param sessionId - 要更新的会话 ID。
     * @param message - 要更新的消息。
     */
    async updateSessionMessage(sessionId: string | null | undefined, message: Message): Promise<void> {
      if (!sessionId) return;
      if (!is.persistableMessage(message)) return;

      const record = toRecordMessage(sessionId, message);
      await retryDuringDatabaseInitialization(async () => {
        const result = await getElectronAPI().chatMessageUpdate(record);
        unwrap(result);
      });
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

      await retryDuringDatabaseInitialization(async () => {
        const result = await getElectronAPI().chatMessageSetAll(sessionId, records);
        unwrap(result);
      });
    },

    /**
     * 仅更新会话标题，保持排序和使用量元数据不变。
     * @param sessionId - 要更新的会话 ID。
     * @param title - 新的会话标题。
     */
    async updateSessionTitle(sessionId: string, title: string): Promise<void> {
      await retryDuringDatabaseInitialization(async () => {
        const result = await getElectronAPI().chatSessionUpdateTitle(sessionId, title);
        unwrap(result);
      });
    },

    /**
     * 删除会话及其已持久化的消息。
     * @param sessionId - 要删除的会话 ID。
     */
    async deleteSession(sessionId: string): Promise<void> {
      await retryDuringDatabaseInitialization(async () => {
        const result = await getElectronAPI().chatSessionDelete(sessionId);
        unwrap(result);
      });

      // 级联清理该会话的 todo 数据（在 unwrap 成功后执行，try-catch 防止中断删除流程）
      try {
        useTodoStore().clearTodos(sessionId);
      } catch {
        // todo 清理失败不影响会话删除结果
      }
    }
  }
});

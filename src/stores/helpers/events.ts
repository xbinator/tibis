/**
 * @file events.ts
 * @description stores 层事件总线，用于解耦 store 间直接依赖。
 */
import { emitter } from '@/utils/emitter';

export interface FileMissingPayload {
  fileId: string;
}

export interface FileRecoveredPayload {
  fileId: string;
}

/**
 * 聊天会话标题持久化事件载荷。
 */
export interface ChatSessionTitlePayload {
  /** 已更新标题的会话 ID。 */
  sessionId: string;
  /** 持久化后的会话标题。 */
  title: string;
}

export const storeEvents = {
  fileMissing: 'store:fileMissing',
  fileRecovered: 'store:fileRecovered',
  chatSessionTitleUpdated: 'store:chatSessionTitleUpdated',

  emitFileMissing(fileId: string): void {
    emitter.emit(this.fileMissing, { fileId } satisfies FileMissingPayload);
  },

  emitFileRecovered(fileId: string): void {
    emitter.emit(this.fileRecovered, { fileId } satisfies FileRecoveredPayload);
  },

  /**
   * 发布聊天会话标题更新。
   * @param sessionId - 会话 ID
   * @param title - 最新标题
   */
  emitChatSessionTitleUpdated(sessionId: string, title: string): void {
    emitter.emit(this.chatSessionTitleUpdated, { sessionId, title } satisfies ChatSessionTitlePayload);
  },

  onFileMissing(handler: (payload: FileMissingPayload) => void): () => void {
    return emitter.on(this.fileMissing, handler as (payload: unknown) => void);
  },

  onFileRecovered(handler: (payload: FileRecoveredPayload) => void): () => void {
    return emitter.on(this.fileRecovered, handler as (payload: unknown) => void);
  },

  /**
   * 订阅聊天会话标题更新。
   * @param handler - 标题事件处理器
   * @returns 取消订阅函数
   */
  onChatSessionTitleUpdated(handler: (payload: ChatSessionTitlePayload) => void): () => void {
    return emitter.on(this.chatSessionTitleUpdated, handler as (payload: unknown) => void);
  }
};

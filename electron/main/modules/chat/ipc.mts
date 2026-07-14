/**
 * @file ipc.mts
 * @description 聊天模块 IPC handler 注册。
 */
import type { ChatMessageHistoryCursor, ChatMessageRecord, ChatSession, ChatSessionType, SessionPaginationParams } from 'types/chat';
import type { CompressionRecord, CompressionRecordStatus } from 'types/compression';
import type { ChatHandlerResult } from 'types/electron-api';
import { ipcMain } from 'electron';
import { chatSessionManager } from './service.mjs';

function wrapHandler<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => ChatHandlerResult<T> {
  return (...args: unknown[]) => {
    try {
      const result = fn(...args);
      return { ok: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof Error && 'code' in error ? (error as { code: string }).code : 'UNKNOWN';
      return { ok: false, error: message, code };
    }
  };
}

export function registerChatHandlers(): void {
  // ── Session (6 个) ──
  ipcMain.handle(
    'chat:session:list',
    wrapHandler((_event, type, pagination?) => {
      return chatSessionManager.getSessionsByType(type as ChatSessionType, pagination as SessionPaginationParams | undefined);
    })
  );
  ipcMain.handle(
    'chat:session:create',
    wrapHandler((_event, session) => {
      chatSessionManager.createSession(session as ChatSession);
    })
  );
  ipcMain.handle(
    'chat:session:branch',
    wrapHandler((_event, sourceSessionId, targetMessageId) => {
      return chatSessionManager.branchSession(sourceSessionId as string, targetMessageId as string);
    })
  );
  ipcMain.handle(
    'chat:session:updateTitle',
    wrapHandler((_event, sessionId, title) => {
      chatSessionManager.updateSessionTitle(sessionId as string, title as string);
    })
  );
  ipcMain.handle(
    'chat:session:delete',
    wrapHandler((_event, sessionId) => {
      chatSessionManager.deleteSession(sessionId as string);
    })
  );
  ipcMain.handle(
    'chat:session:usage:get',
    wrapHandler((_event, sessionId) => {
      return chatSessionManager.getSessionUsage(sessionId as string);
    })
  );

  // ── Message (3 个) ──
  ipcMain.handle(
    'chat:message:list',
    wrapHandler((_event, sessionId, cursor?) => {
      return chatSessionManager.getMessages(sessionId as string, cursor as ChatMessageHistoryCursor | undefined);
    })
  );
  ipcMain.handle(
    'chat:message:add',
    wrapHandler((_event, message) => {
      chatSessionManager.addMessage(message as ChatMessageRecord);
    })
  );
  ipcMain.handle(
    'chat:message:update',
    wrapHandler((_event, message) => {
      chatSessionManager.updateMessage(message as ChatMessageRecord);
    })
  );
  ipcMain.handle(
    'chat:message:setAll',
    wrapHandler((_event, sessionId, messages) => {
      chatSessionManager.setSessionMessages(sessionId as string, messages as ChatMessageRecord[]);
    })
  );

  // ── Compression Records (4 个) ──
  ipcMain.handle(
    'chat:compression:getLatest',
    wrapHandler((_event, sessionId) => {
      return chatSessionManager.getLatestValidRecord(sessionId as string);
    })
  );
  ipcMain.handle(
    'chat:compression:create',
    wrapHandler((_event, record) => {
      return chatSessionManager.createRecord(record as Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>);
    })
  );
  ipcMain.handle(
    'chat:compression:updateStatus',
    wrapHandler((_event, id, status, invalidReason?) => {
      chatSessionManager.updateRecordStatus(id as string, status as CompressionRecordStatus, invalidReason as string | undefined);
    })
  );
  ipcMain.handle(
    'chat:compression:getAll',
    wrapHandler((_event, sessionId) => {
      return chatSessionManager.getAllRecords(sessionId as string);
    })
  );
}

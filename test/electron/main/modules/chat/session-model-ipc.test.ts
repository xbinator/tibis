/**
 * @file session-model-ipc.test.ts
 * @description 聊天会话按 ID 读取与模型元数据更新 IPC 路由测试。
 */
import { readFileSync } from 'node:fs';
import type { ChatSession, ChatSessionModelMetadata } from 'types/chat';
import type { ChatHandlerResult } from 'types/electron-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerChatHandlers } from '../../../../../electron/main/modules/chat/ipc.mts';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  getSessionById: vi.fn(),
  updateSessionModel: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown): void => {
      mocks.handlers.set(channel, handler);
    })
  }
}));

vi.mock('../../../../../electron/main/modules/chat/service.mjs', () => ({
  chatSessionManager: {
    getSessionById: mocks.getSessionById,
    updateSessionModel: mocks.updateSessionModel
  }
}));

/**
 * 调用已注册的测试 IPC handler。
 * @param channel - IPC channel
 * @param args - Renderer 传入参数
 * @returns 标准聊天结果信封
 */
function callHandler<T>(channel: string, ...args: unknown[]): ChatHandlerResult<T> {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error(`${channel} handler was not registered`);
  return handler({}, ...args) as ChatHandlerResult<T>;
}

describe('chat session model IPC', (): void => {
  beforeEach((): void => {
    mocks.handlers.clear();
    mocks.getSessionById.mockReset();
    mocks.updateSessionModel.mockReset();
    registerChatHandlers();
  });

  it('returns one session by id through the standard result envelope', (): void => {
    const session: ChatSession = {
      id: 'session-1',
      type: 'assistant',
      title: 'Session',
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
      lastMessageAt: '2026-07-22T00:00:00.000Z'
    };
    mocks.getSessionById.mockReturnValue(session);

    expect(callHandler<ChatSession | undefined>('chat:session:get', 'session-1')).toEqual({ ok: true, data: session });
    expect(mocks.getSessionById).toHaveBeenCalledWith('session-1');
  });

  it('updates one session model through the standard result envelope', (): void => {
    const model: ChatSessionModelMetadata = { providerId: 'provider-1', modelId: 'model-2' };
    const session: ChatSession = {
      id: 'session-1',
      type: 'assistant',
      title: 'Session',
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:01.000Z',
      lastMessageAt: '2026-07-22T00:00:00.000Z',
      metadata: { model }
    };
    mocks.updateSessionModel.mockReturnValue(session);

    expect(callHandler<ChatSession>('chat:session:updateModel', 'session-1', model)).toEqual({ ok: true, data: session });
    expect(mocks.updateSessionModel).toHaveBeenCalledWith('session-1', model);
  });

  it('forwards both session channels from the preload bridge', (): void => {
    const preloadSource = readFileSync('electron/preload/index.mts', 'utf8');

    expect(preloadSource).toContain("ipcRenderer.invoke('chat:session:get', sessionId)");
    expect(preloadSource).toContain("ipcRenderer.invoke('chat:session:updateModel', sessionId, model)");
  });
});

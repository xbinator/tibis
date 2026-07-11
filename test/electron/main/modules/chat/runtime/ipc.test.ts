/**
 * @file ipc.test.ts
 * @description ChatRuntime 恢复 IPC 注册测试。
 */
import type { ChatRuntimeHandlerResult, ChatRuntimeRecoverySnapshot } from 'types/chat-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerChatRuntimeHandlers } from '../../../../../../electron/main/modules/chat/runtime/ipc.mjs';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  listRecoverySnapshots: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>): void => {
      mocks.handlers.set(channel, handler);
    })
  }
}));

vi.mock('../../../../../../electron/main/modules/chat/runtime/service.mjs', () => ({
  chatRuntimeService: {
    listRecoverySnapshots: mocks.listRecoverySnapshots
  }
}));

describe('chat runtime recovery IPC', (): void => {
  beforeEach((): void => {
    mocks.handlers.clear();
    mocks.listRecoverySnapshots.mockReset();
  });

  it('returns active runtime recovery snapshots through the standard result envelope', async (): Promise<void> => {
    const snapshots: ChatRuntimeRecoverySnapshot[] = [
      {
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'primary',
        phase: 'streaming',
        createdAt: 1,
        pendingRequests: []
      }
    ];
    mocks.listRecoverySnapshots.mockReturnValue(snapshots);
    registerChatRuntimeHandlers();

    const handler = mocks.handlers.get('chat:runtime:list-active');
    if (!handler) throw new Error('list-active handler was not registered');
    const result = (await handler({})) as ChatRuntimeHandlerResult<ChatRuntimeRecoverySnapshot[]>;

    expect(result).toEqual({ ok: true, data: snapshots });
  });
});

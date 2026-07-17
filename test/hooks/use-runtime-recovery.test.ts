/**
 * @file use-runtime-recovery.test.ts
 * @description renderer 启动时 ChatRuntime 恢复测试。
 * @vitest-environment jsdom
 */
import type { ChatRuntimeRecoverySnapshot } from 'types/chat-runtime';
import { describe, expect, it, vi } from 'vitest';
import { createChatActorSystem } from '@/ai/chat/actorSystem';
import { recoverRuntimes } from '@/hooks/useChat/useRuntimeRecovery';

const electronAPIMock = vi.hoisted(() => ({
  chatRuntimeListActive: vi.fn(),
  chatRuntimeSubmitToolResult: vi.fn(),
  chatRuntimeSubmitBridgeResponse: vi.fn()
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: (): typeof electronAPIMock => electronAPIMock
}));

/** 创建包含三类待处理请求的恢复快照。 */
function createSnapshot(): ChatRuntimeRecoverySnapshot {
  const base = { runtimeId: 'runtime-1', sessionId: 'session-1', clientId: 'bchat', agentId: 'primary' };
  return {
    ...base,
    phase: 'streaming',
    createdAt: 1,
    capabilities: { rendererToolNames: ['read_current_document'], documentId: 'document-1' },
    pendingRequests: [
      { type: 'tool', event: { ...base, toolCallId: 'tool-call-1', toolName: 'read_current_document', input: {} } },
      {
        type: 'confirmation',
        event: {
          ...base,
          confirmationId: 'confirmation-1',
          request: { toolName: 'write_file', title: '写入文件', description: '是否写入？', riskLevel: 'write' }
        }
      },
      { type: 'bridge', event: { ...base, requestId: 'bridge-1', kind: 'document-snapshot' } }
    ]
  };
}

describe('recoverRuntimes', (): void => {
  it('hydrates actors, replays confirmation, and resolves degraded renderer requests', async (): Promise<void> => {
    const snapshot = createSnapshot();
    electronAPIMock.chatRuntimeListActive.mockResolvedValue({ ok: true, data: [snapshot] });
    electronAPIMock.chatRuntimeSubmitToolResult.mockResolvedValue({ ok: true });
    electronAPIMock.chatRuntimeSubmitBridgeResponse.mockResolvedValue({ ok: true });
    const system = createChatActorSystem();
    system.start();

    await recoverRuntimes(system);

    expect(system.getSession('session-1')?.getSnapshot().matches('waitingForUser')).toBe(true);
    expect(system.getRuntimeCapabilities('runtime-1')?.documentId).toBe('document-1');
    expect(electronAPIMock.chatRuntimeSubmitToolResult).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeId: 'runtime-1', result: expect.objectContaining({ status: 'failure' }) })
    );
    expect(electronAPIMock.chatRuntimeSubmitBridgeResponse).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeId: 'runtime-1', result: expect.objectContaining({ status: 'failure' }) })
    );
    const confirmationListener = vi.fn();
    system.subscribeSessionEvents('session-1', confirmationListener);
    expect(confirmationListener).toHaveBeenCalledWith(expect.objectContaining({ type: 'confirmationRequested' }));
    system.stop();
  });

  it('removes a runtime that completes between recovery queries', async (): Promise<void> => {
    const snapshot = createSnapshot();
    electronAPIMock.chatRuntimeListActive.mockResolvedValueOnce({ ok: true, data: [snapshot] }).mockResolvedValueOnce({ ok: true, data: [] });
    electronAPIMock.chatRuntimeSubmitToolResult.mockResolvedValue({ ok: true });
    electronAPIMock.chatRuntimeSubmitBridgeResponse.mockResolvedValue({ ok: true });
    const system = createChatActorSystem();
    system.start();

    await recoverRuntimes(system);

    expect(system.actor.getSnapshot().context.runtimeRoutes.has('runtime-1')).toBe(false);
    expect(system.getSession('session-1')?.getSnapshot().matches('idle')).toBe(true);
    system.stop();
  });
});

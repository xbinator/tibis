/**
 * @file actor-system.test.ts
 * @description 应用级 Chat Actor system 外观测试。
 */
import type { ChatRuntimeRecoverySnapshot } from 'types/chat-runtime';
import { describe, expect, it } from 'vitest';
import { createChatActorSystem } from '@/ai/chat/actorSystem';

describe('chat actor system', (): void => {
  it('owns one Supervisor and exposes stable Session actors', (): void => {
    const system = createChatActorSystem();
    system.start();

    const firstSession = system.ensureSession('session-1');
    const secondRead = system.ensureSession('session-1');

    expect(secondRead).toBe(firstSession);
    expect(system.getSession('session-1')).toBe(firstSession);
    system.stop();
    expect(system.actor.getSnapshot().status).toBe('stopped');
  });

  it('recovers a runtime idempotently and upgrades its capabilities', (): void => {
    const system = createChatActorSystem();
    system.start();
    const snapshot: ChatRuntimeRecoverySnapshot = {
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      clientId: 'bchat',
      agentId: 'primary',
      phase: 'streaming',
      createdAt: 1,
      pendingRequests: []
    };
    const degradedCapabilities = {
      tools: [],
      getToolContext: (): undefined => undefined,
      handleBridgeRequest: async (): Promise<unknown> => undefined
    };

    system.recoverRuntime(snapshot, degradedCapabilities);
    const firstSession = system.getSession('session-1');
    const firstTurn = firstSession?.getSnapshot().context.turnRef;
    system.recoverRuntime(snapshot, { ...degradedCapabilities, documentId: 'document-1' });

    expect(system.getSession('session-1')).toBe(firstSession);
    expect(firstSession?.getSnapshot().context.turnRef).toBe(firstTurn);
    expect(system.actor.getSnapshot().context.runtimeRoutes.get('runtime-1')).toMatchObject({ sessionId: 'session-1' });
    expect(system.getRuntimeCapabilities('runtime-1')?.documentId).toBe('document-1');
    system.stop();
  });
});

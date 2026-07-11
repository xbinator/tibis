/**
 * @file actor-system.test.ts
 * @description 应用级 Chat Actor system 外观测试。
 */
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
});

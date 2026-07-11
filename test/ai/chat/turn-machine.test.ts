/**
 * @file turn-machine.test.ts
 * @description Chat Turn Actor 聚合与取消测试。
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { turnMachine } from '@/ai/chat/machine/turnMachine';
import type { ChatIntent } from '@/ai/chat/types';

/** Turn 测试提交意图。 */
const SUBMIT_INTENT: ChatIntent = {
  type: 'submit',
  input: {
    messageId: 'user-1',
    createdAt: '2026-07-11T00:00:00.000Z',
    content: 'hello',
    parts: []
  }
};

describe('turnMachine', (): void => {
  it('creates the primary Agent when the Turn is prepared', (): void => {
    const actor = createActor(turnMachine, {
      input: { sessionId: 'session-1', turnId: 'turn-1', intent: SUBMIT_INTENT }
    });
    actor.start();

    expect(actor.getSnapshot().matches('preparing')).toBe(true);
    actor.send({ type: 'turn.prepared', request: { contextWindow: 12000 } });

    expect(actor.getSnapshot().matches('running')).toBe(true);
    expect(actor.getSnapshot().context.primaryAgentRef).toBeDefined();
  });

  it('cascades cancellation to the primary Agent and stops it when cancelled', (): void => {
    const actor = createActor(turnMachine, {
      input: { sessionId: 'session-1', turnId: 'turn-1', intent: SUBMIT_INTENT }
    });
    actor.start();
    actor.send({ type: 'turn.prepared', request: {} });
    const agentRef = actor.getSnapshot().context.primaryAgentRef;

    actor.send({ type: 'turn.cancel' });
    expect(actor.getSnapshot().matches('cancelling')).toBe(true);
    actor.send({ type: 'turn.cancelled' });

    expect(actor.getSnapshot().matches('cancelled')).toBe(true);
    expect(agentRef?.getSnapshot().status).not.toBe('active');
  });
});

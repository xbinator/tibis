/**
 * @file turn-machine.test.ts
 * @description Chat Turn Actor 聚合与取消测试。
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { selectTurnAgentIds, turnMachine } from '@/ai/chat/machine/turnMachine';
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
  it('creates the primary Agent and supports dynamic child Agents', (): void => {
    const actor = createActor(turnMachine, {
      input: { sessionId: 'session-1', turnId: 'turn-1', intent: SUBMIT_INTENT }
    });
    actor.start();

    actor.send({ type: 'turn.prepare' });
    expect(actor.getSnapshot().matches('preparing')).toBe(true);
    actor.send({ type: 'turn.prepared', request: { contextWindow: 12000 } });

    expect(actor.getSnapshot().matches('running')).toBe(true);
    expect(selectTurnAgentIds(actor.getSnapshot())).toEqual(['primary']);

    actor.send({ type: 'agent.spawned', agentId: 'researcher', parentAgentId: 'primary' });
    expect(selectTurnAgentIds(actor.getSnapshot())).toEqual(['primary', 'researcher']);
  });

  it('cascades cancellation to every Agent and stops children when cancelled', (): void => {
    const actor = createActor(turnMachine, {
      input: { sessionId: 'session-1', turnId: 'turn-1', intent: SUBMIT_INTENT }
    });
    actor.start();
    actor.send({ type: 'turn.prepare' });
    actor.send({ type: 'turn.prepared', request: {} });
    actor.send({ type: 'agent.spawned', agentId: 'researcher', parentAgentId: 'primary' });
    const agentRefs = Object.values(actor.getSnapshot().context.agents);

    actor.send({ type: 'turn.cancel' });
    expect(actor.getSnapshot().matches('cancelling')).toBe(true);
    actor.send({ type: 'turn.cancelled' });

    expect(actor.getSnapshot().matches('cancelled')).toBe(true);
    expect(agentRefs.every((agentRef) => agentRef.getSnapshot().status !== 'active')).toBe(true);
  });
});

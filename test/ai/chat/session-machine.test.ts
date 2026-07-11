/**
 * @file session-machine.test.ts
 * @description Chat Session 串行、继续、回退和压缩状态测试。
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { sessionMachine } from '@/ai/chat/machine/sessionMachine';
import type { ChatSubmitInput } from '@/ai/chat/types';

/** Session 测试提交输入。 */
const SUBMIT_INPUT: ChatSubmitInput = {
  messageId: 'user-1',
  createdAt: '2026-07-11T00:00:00.000Z',
  content: 'first',
  parts: []
};

describe('sessionMachine', (): void => {
  it('serializes submits and resumes the same Turn after user choice', (): void => {
    const actor = createActor(sessionMachine, { input: { sessionId: 'session-1' } });
    actor.start();
    actor.send({ type: 'session.submit', input: SUBMIT_INPUT });
    const initialTurnRef = actor.getSnapshot().context.turnRef;

    expect(actor.getSnapshot().matches('preparing')).toBe(true);
    actor.send({ type: 'session.submit', input: { ...SUBMIT_INPUT, messageId: 'user-2', content: 'second' } });
    expect(actor.getSnapshot().context.intent).toMatchObject({ type: 'submit', input: { messageId: 'user-1' } });

    actor.send({ type: 'session.prepared' });
    expect(actor.getSnapshot().matches('running')).toBe(true);
    actor.send({ type: 'session.userChoiceRequired' });
    expect(actor.getSnapshot().matches('waitingForUser')).toBe(true);

    actor.send({
      type: 'session.userChoiceSubmitted',
      answer: { questionId: 'question-1', toolCallId: 'tool-1', answers: ['yes'] }
    });
    expect(actor.getSnapshot().matches('preparing')).toBe(true);
    expect(actor.getSnapshot().context.turnRef).toBe(initialTurnRef);
    actor.send({
      type: 'session.preparationFailed',
      error: { code: 'preparation_failed', message: 'provider unavailable' }
    });
    expect(actor.getSnapshot().matches('waitingForUser')).toBe(true);
  });

  it('restores a persisted user-choice continuation after actor restart', (): void => {
    const actor = createActor(sessionMachine, { input: { sessionId: 'session-1' } });
    actor.start();
    actor.send({
      type: 'session.userChoiceSubmitted',
      answer: { questionId: 'question-1', toolCallId: 'tool-1', answers: ['yes'] }
    });

    expect(actor.getSnapshot().matches('preparing')).toBe(true);
    expect(actor.getSnapshot().context.intent).toMatchObject({ type: 'continue' });
    expect(actor.getSnapshot().context.turnRef).toBeDefined();
  });

  it('resumes the same Runtime after a confirmation is resolved', (): void => {
    const actor = createActor(sessionMachine, { input: { sessionId: 'session-1' } });
    actor.start();
    actor.send({ type: 'session.submit', input: SUBMIT_INPUT });
    actor.send({ type: 'session.prepared' });
    actor.send({ type: 'session.userChoiceRequired' });
    actor.send({ type: 'session.interactionResolved' });

    expect(actor.getSnapshot().matches('running')).toBe(true);
    expect(actor.getSnapshot().context.turnRef?.getSnapshot().matches('running')).toBe(true);
  });

  it('restores idle after regenerate preparation failure', (): void => {
    const actor = createActor(sessionMachine, { input: { sessionId: 'session-1' } });
    actor.start();
    actor.send({ type: 'session.regenerate', targetMessageId: 'assistant-1' });
    actor.send({
      type: 'session.preparationFailed',
      error: { code: 'preparation_failed', message: 'model missing' }
    });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(actor.getSnapshot().context.error?.message).toBe('model missing');
  });

  it('cancels an active Turn before applying rollback', (): void => {
    const actor = createActor(sessionMachine, { input: { sessionId: 'session-1' } });
    actor.start();
    actor.send({ type: 'session.submit', input: SUBMIT_INPUT });
    actor.send({ type: 'session.prepared' });
    actor.send({ type: 'session.rollbackRequested', targetMessageId: 'user-1' });

    expect(actor.getSnapshot().matches({ rollingBack: 'cancellingActiveRuntime' })).toBe(true);
    actor.send({ type: 'session.runtimeCancelled' });
    expect(actor.getSnapshot().matches({ rollingBack: 'applyingRollback' })).toBe(true);
    actor.send({ type: 'session.rollbackCompleted' });
    expect(actor.getSnapshot().matches('idle')).toBe(true);
  });

  it('only starts compaction while idle', (): void => {
    const actor = createActor(sessionMachine, { input: { sessionId: 'session-1' } });
    actor.start();
    actor.send({ type: 'session.compactRequested' });
    expect(actor.getSnapshot().matches('compacting')).toBe(true);
    actor.send({ type: 'session.submit', input: SUBMIT_INPUT });
    expect(actor.getSnapshot().matches('compacting')).toBe(true);
    actor.send({ type: 'session.compactCompleted' });
    expect(actor.getSnapshot().matches('idle')).toBe(true);
  });

  it('cancels compaction and supports rollback while compacting', (): void => {
    const actor = createActor(sessionMachine, { input: { sessionId: 'session-1' } });
    actor.start();
    actor.send({ type: 'session.compactRequested' });
    actor.send({ type: 'session.cancelRequested' });
    expect(actor.getSnapshot().matches('cancelling')).toBe(true);
    actor.send({ type: 'session.runtimeCancelled' });
    expect(actor.getSnapshot().matches('idle')).toBe(true);

    actor.send({ type: 'session.compactRequested' });
    actor.send({ type: 'session.rollbackRequested', targetMessageId: 'user-1' });
    expect(actor.getSnapshot().matches({ rollingBack: 'cancellingActiveRuntime' })).toBe(true);
    actor.send({ type: 'session.runtimeCancelled' });
    expect(actor.getSnapshot().matches({ rollingBack: 'applyingRollback' })).toBe(true);
  });
});

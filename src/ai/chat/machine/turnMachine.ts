/**
 * @file turnMachine.ts
 * @description 单个用户 Turn 与主 Agent 的 XState 定义。
 */
import type { ChatIntent, ChatWorkflowError } from '../types';
import type { ActorRefFrom } from 'xstate';
import { assign, enqueueActions, setup } from 'xstate';
import { agentMachine } from './agentMachine';

/** Turn machine 输入。 */
export interface TurnMachineInput {
  /** 会话 ID。 */
  sessionId: string;
  /** Turn ID。 */
  turnId: string;
  /** 当前聊天意图。 */
  intent: ChatIntent;
}

/** Turn machine context。 */
export interface TurnMachineContext extends TurnMachineInput {
  /** 当前 Turn 的主 Agent。 */
  primaryAgentRef?: ActorRefFrom<typeof agentMachine>;
  /** 已准备的 Runtime 请求数据。 */
  request?: Record<string, unknown>;
  /** 当前流程错误。 */
  error?: ChatWorkflowError;
}

/** Turn machine 领域事件。 */
export type TurnMachineEvent =
  | { type: 'turn.prepared'; request: Record<string, unknown> }
  | { type: 'turn.recovered'; runtimeId: string; waiting: boolean }
  | { type: 'turn.waiting' }
  | { type: 'turn.resume' }
  | { type: 'turn.interactionResolved' }
  | { type: 'turn.cancel' }
  | { type: 'turn.cancelled' }
  | { type: 'turn.completed' }
  | { type: 'turn.failed'; error: ChatWorkflowError };

/** Turn machine。 */
export const turnMachine = setup({
  types: {
    context: {} as TurnMachineContext,
    input: {} as TurnMachineInput,
    events: {} as TurnMachineEvent,
    tags: {} as 'busy' | 'abortable' | 'waitingForUser'
  },
  actors: { agentMachine },
  guards: {
    isRecoveredWaiting: ({ event }): boolean => event.type === 'turn.recovered' && event.waiting
  },
  actions: {
    assignPreparedRequestAndPrimaryAgent: assign({
      request: ({ event }): Record<string, unknown> | undefined => {
        if (event.type === 'turn.prepared') return event.request;
        if (event.type === 'turn.recovered') return {};
        return undefined;
      },
      primaryAgentRef: ({ context, spawn }): ActorRefFrom<typeof agentMachine> =>
        context.primaryAgentRef ??
        spawn('agentMachine', {
          id: 'primary',
          input: {
            address: {
              sessionId: context.sessionId,
              turnId: context.turnId,
              agentId: 'primary'
            }
          }
        })
    }),
    startRecoveredPrimaryAgent: enqueueActions(({ context, event, enqueue }): void => {
      if (event.type !== 'turn.recovered') return;
      if (!context.primaryAgentRef) return;
      enqueue.sendTo(context.primaryAgentRef, { type: 'runtime.started', runtimeId: event.runtimeId });
      if (event.waiting) {
        enqueue.sendTo(context.primaryAgentRef, { type: 'runtime.userChoiceRequired', runtimeId: event.runtimeId, interaction: 'confirmation' });
      }
    }),
    cancelPrimaryAgent: enqueueActions(({ context, enqueue }): void => {
      if (context.primaryAgentRef) enqueue.sendTo(context.primaryAgentRef, { type: 'agent.cancel' });
    }),
    assignError: assign({
      error: ({ event }): ChatWorkflowError | undefined => (event.type === 'turn.failed' ? event.error : undefined)
    })
  }
}).createMachine({
  id: 'chatTurn',
  context: ({ input }): TurnMachineContext => ({ ...input }),
  initial: 'preparing',
  states: {
    preparing: {
      tags: ['busy'],
      on: {
        'turn.recovered': [
          {
            target: 'waiting',
            guard: 'isRecoveredWaiting',
            actions: ['assignPreparedRequestAndPrimaryAgent', 'startRecoveredPrimaryAgent']
          },
          {
            target: 'running',
            actions: ['assignPreparedRequestAndPrimaryAgent', 'startRecoveredPrimaryAgent']
          }
        ],
        'turn.prepared': { target: 'running', actions: 'assignPreparedRequestAndPrimaryAgent' },
        'turn.waiting': 'waiting',
        'turn.failed': { target: 'failed', actions: 'assignError' },
        'turn.cancel': { target: 'cancelling', actions: 'cancelPrimaryAgent' }
      }
    },
    running: {
      tags: ['busy', 'abortable'],
      on: {
        'turn.waiting': 'waiting',
        'turn.cancel': { target: 'cancelling', actions: 'cancelPrimaryAgent' },
        'turn.completed': 'completed',
        'turn.failed': { target: 'failed', actions: 'assignError' }
      }
    },
    waiting: {
      tags: ['abortable', 'waitingForUser'],
      on: {
        'turn.resume': 'preparing',
        'turn.interactionResolved': 'running',
        'turn.cancel': { target: 'cancelling', actions: 'cancelPrimaryAgent' },
        'turn.completed': 'completed',
        'turn.failed': { target: 'failed', actions: 'assignError' }
      }
    },
    cancelling: {
      tags: ['busy'],
      on: {
        'turn.cancelled': 'cancelled',
        'turn.failed': { target: 'failed', actions: 'assignError' }
      }
    },
    completed: { type: 'final' },
    cancelled: { type: 'final' },
    failed: { type: 'final' }
  }
});

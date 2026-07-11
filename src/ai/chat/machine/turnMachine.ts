/**
 * @file turnMachine.ts
 * @description 单个用户 Turn 与动态 Agent 子树的 XState 定义。
 */
import type { ChatIntent, ChatWorkflowError } from '../types';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { assign, setup } from 'xstate';
import { agentMachine } from './agentMachine';

/**
 * Turn machine 输入。
 */
export interface TurnMachineInput {
  /** 会话 ID */
  sessionId: string;
  /** Turn ID */
  turnId: string;
  /** 当前聊天意图 */
  intent: ChatIntent;
}

/**
 * Turn machine context。
 */
export interface TurnMachineContext extends TurnMachineInput {
  /** 当前 Turn 的 Agent refs */
  agents: Record<string, ActorRefFrom<typeof agentMachine>>;
  /** 已准备的 Runtime 请求数据 */
  request?: Record<string, unknown>;
  /** 当前流程错误 */
  error?: ChatWorkflowError;
}

/**
 * Turn machine 领域事件。
 */
export type TurnMachineEvent =
  | { type: 'turn.prepare' }
  | { type: 'turn.prepared'; request: Record<string, unknown> }
  | { type: 'turn.waiting' }
  | { type: 'turn.resume' }
  | { type: 'turn.interactionResolved' }
  | { type: 'turn.cancel' }
  | { type: 'turn.cancelled' }
  | { type: 'turn.completed' }
  | { type: 'turn.failed'; error: ChatWorkflowError }
  | { type: 'agent.spawned'; agentId: string; parentAgentId?: string };

/**
 * 通知全部 Agent 取消当前工作。
 * @param agents - Agent refs
 */
function cancelAgents(agents: Record<string, ActorRefFrom<typeof agentMachine>>): void {
  for (const agentRef of Object.values(agents)) {
    agentRef.send({ type: 'agent.cancel' });
  }
}

/**
 * Turn machine。
 */
export const turnMachine = setup({
  types: {
    context: {} as TurnMachineContext,
    input: {} as TurnMachineInput,
    events: {} as TurnMachineEvent,
    tags: {} as 'busy' | 'abortable' | 'waitingForUser'
  },
  actors: {
    agentMachine
  },
  actions: {
    assignPreparedRequestAndPrimaryAgent: assign({
      request: ({ event }): Record<string, unknown> | undefined => (event.type === 'turn.prepared' ? event.request : undefined),
      agents: ({ context, spawn }): Record<string, ActorRefFrom<typeof agentMachine>> => {
        if (context.agents.primary) {
          return context.agents;
        }

        const primaryAgent = spawn('agentMachine', {
          id: 'primary',
          input: {
            address: {
              sessionId: context.sessionId,
              turnId: context.turnId,
              agentId: 'primary'
            }
          }
        });
        primaryAgent.send({ type: 'agent.start' });

        return { ...context.agents, primary: primaryAgent };
      }
    }),
    spawnAgent: assign({
      agents: ({ context, event, spawn }): Record<string, ActorRefFrom<typeof agentMachine>> => {
        if (event.type !== 'agent.spawned' || context.agents[event.agentId]) {
          return context.agents;
        }

        const agentRef = spawn('agentMachine', {
          id: event.agentId,
          input: {
            address: {
              sessionId: context.sessionId,
              turnId: context.turnId,
              agentId: event.agentId,
              parentAgentId: event.parentAgentId
            }
          }
        });
        agentRef.send({ type: 'agent.start' });

        return { ...context.agents, [event.agentId]: agentRef };
      }
    }),
    cancelAgents: ({ context }): void => cancelAgents(context.agents),
    assignError: assign({
      error: ({ event }): ChatWorkflowError | undefined => (event.type === 'turn.failed' ? event.error : undefined)
    })
  }
}).createMachine({
  id: 'chatTurn',
  context: ({ input }): TurnMachineContext => ({ ...input, agents: {} }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        'turn.prepare': 'preparing'
      }
    },
    preparing: {
      tags: ['busy'],
      on: {
        'turn.prepared': {
          target: 'running',
          actions: 'assignPreparedRequestAndPrimaryAgent'
        },
        'turn.waiting': 'waiting',
        'turn.failed': {
          target: 'failed',
          actions: 'assignError'
        },
        'turn.cancel': {
          target: 'cancelling',
          actions: 'cancelAgents'
        }
      }
    },
    running: {
      tags: ['busy', 'abortable'],
      on: {
        'agent.spawned': {
          actions: 'spawnAgent'
        },
        'turn.waiting': 'waiting',
        'turn.cancel': {
          target: 'cancelling',
          actions: 'cancelAgents'
        },
        'turn.completed': 'completed',
        'turn.failed': {
          target: 'failed',
          actions: 'assignError'
        }
      }
    },
    waiting: {
      tags: ['abortable', 'waitingForUser'],
      on: {
        'turn.resume': 'preparing',
        'turn.interactionResolved': 'running',
        'turn.cancel': {
          target: 'cancelling',
          actions: 'cancelAgents'
        },
        'turn.completed': 'completed',
        'turn.failed': {
          target: 'failed',
          actions: 'assignError'
        }
      }
    },
    cancelling: {
      tags: ['busy'],
      on: {
        'turn.cancelled': 'cancelled',
        'turn.failed': {
          target: 'failed',
          actions: 'assignError'
        }
      }
    },
    completed: {
      type: 'final'
    },
    cancelled: {
      type: 'final'
    },
    failed: {
      type: 'final'
    }
  }
});

/** Turn machine snapshot。 */
export type TurnMachineSnapshot = SnapshotFrom<typeof turnMachine>;

/**
 * 读取 Turn 当前 Agent ID。
 * @param snapshot - Turn snapshot
 * @returns 稳定排序的 Agent ID
 */
export function selectTurnAgentIds(snapshot: TurnMachineSnapshot): string[] {
  return Object.keys(snapshot.context.agents).sort();
}

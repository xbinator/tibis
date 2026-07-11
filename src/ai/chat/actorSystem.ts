/**
 * @file actorSystem.ts
 * @description 应用级 Chat Supervisor、Runtime 能力和 Session UI 事件外观。
 */
import type { SessionMachineEvent } from './machine/sessionMachine';
import type { ChatActorAddress } from './types';
import type { ActorRefFrom } from 'xstate';
import { createActor } from 'xstate';
import { supervisorMachine, type SupervisorMachineEvent } from './machine/supervisorMachine';
import { createRuntimeCapabilityRegistry, type RuntimeExecutionCapabilities } from './runtimeCapabilities';
import { createChatSessionEventBus, type ChatSessionUIEvent, type ChatSessionUIEventListener } from './sessionEvents';

/**
 * 应用级 Chat Actor system。
 */
export interface ChatActorSystem {
  /** Supervisor actor */
  actor: ActorRefFrom<typeof supervisorMachine>;
  /** 启动 Actor system */
  start: () => void;
  /** 停止 Actor system */
  stop: () => void;
  /** 确保 Session actor 存在 */
  ensureSession: (sessionId: string) => NonNullable<ReturnType<ChatActorSystem['getSession']>>;
  /** 读取 Session actor */
  getSession: (
    sessionId: string
  ) => ReturnType<ActorRefFrom<typeof supervisorMachine>['getSnapshot']>['context']['sessions'] extends Map<string, infer TSession>
    ? TSession | undefined
    : never;
  /** 向 Supervisor 发送领域事件 */
  send: (event: SupervisorMachineEvent) => void;
  /** 向 Session 发送领域事件 */
  sendToSession: (sessionId: string, event: SessionMachineEvent) => void;
  /** 注册 Runtime 地址和 renderer 能力 */
  registerRuntime: (address: ChatActorAddress, capabilities: RuntimeExecutionCapabilities) => void;
  /** 注销 Runtime 地址和 renderer 能力 */
  unregisterRuntime: (runtimeId: string) => void;
  /** 读取 Runtime renderer 能力 */
  getRuntimeCapabilities: (runtimeId: string) => RuntimeExecutionCapabilities | undefined;
  /** 订阅 Session UI 事件 */
  subscribeSessionEvents: (sessionId: string, listener: ChatSessionUIEventListener) => () => void;
  /** 发布 Session UI 事件 */
  emitSessionEvent: (sessionId: string, event: ChatSessionUIEvent) => void;
  /** 判断 Session 是否有可见 UI 订阅 */
  hasSessionUISubscribers: (sessionId: string) => boolean;
  /** 清除已处理的 Session 待确认交互 */
  clearSessionPendingInteraction: (sessionId: string, confirmationId: string) => void;
}

/**
 * 创建应用级 Chat Actor system。
 * @returns Chat Actor system
 */
export function createChatActorSystem(): ChatActorSystem {
  const actor = createActor(supervisorMachine);
  const capabilityRegistry = createRuntimeCapabilityRegistry();
  const sessionEventBus = createChatSessionEventBus();

  return {
    actor,
    start(): void {
      actor.start();
    },
    stop(): void {
      actor.stop();
      capabilityRegistry.clear();
      sessionEventBus.clear();
    },
    ensureSession(sessionId: string) {
      actor.send({ type: 'supervisor.ensureSession', sessionId });
      const sessionRef = actor.getSnapshot().context.sessions.get(sessionId);
      if (!sessionRef) {
        throw new Error(`Failed to create chat session actor: ${sessionId}`);
      }
      return sessionRef;
    },
    getSession(sessionId: string) {
      return actor.getSnapshot().context.sessions.get(sessionId);
    },
    send(event: SupervisorMachineEvent): void {
      actor.send(event);
    },
    sendToSession(sessionId: string, event: SessionMachineEvent): void {
      actor.send({ type: 'supervisor.sendToSession', sessionId, event });
    },
    registerRuntime(address: ChatActorAddress, capabilities: RuntimeExecutionCapabilities): void {
      actor.send({ type: 'runtime.register', address });
      capabilityRegistry.register(address.runtimeId, capabilities);
    },
    unregisterRuntime(runtimeId: string): void {
      actor.send({ type: 'runtime.unregister', runtimeId });
      capabilityRegistry.delete(runtimeId);
    },
    getRuntimeCapabilities(runtimeId: string): RuntimeExecutionCapabilities | undefined {
      return capabilityRegistry.get(runtimeId);
    },
    subscribeSessionEvents(sessionId: string, listener: ChatSessionUIEventListener): () => void {
      return sessionEventBus.subscribe(sessionId, listener);
    },
    emitSessionEvent(sessionId: string, event: ChatSessionUIEvent): void {
      sessionEventBus.emit(sessionId, event);
    },
    hasSessionUISubscribers(sessionId: string): boolean {
      return sessionEventBus.hasSubscribers(sessionId);
    },
    clearSessionPendingInteraction(sessionId: string, confirmationId: string): void {
      sessionEventBus.clearPendingInteraction(sessionId, confirmationId);
    }
  };
}

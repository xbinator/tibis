/**
 * @file useChatSessionActor.ts
 * @description BChat 当前 Session Actor 的动态订阅与领域事件 API。
 */
import type { AIUserChoiceAnswerData } from 'types/chat';
import type { ComputedRef, Ref, ShallowRef } from 'vue';
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import type { ChatActorSystem } from '@/ai/chat/actorSystem';
import type { SessionMachineEvent } from '@/ai/chat/machine/sessionMachine';
import type { PendingInteraction } from '@/ai/chat/policies/pendingInteraction';
import type { ChatSessionUIEvent } from '@/ai/chat/sessionEvents';
import type { ChatSubmitInput, ChatWorkflowError } from '@/ai/chat/types';

/**
 * Session Actor hook 选项。
 */
interface UseChatSessionActorOptions {
  /** 当前活动会话 ID */
  activeSessionId: Ref<string | null>;
  /** 应用级 Chat Actor system */
  actorSystem: ChatActorSystem;
  /** 当前可见会话 UI 事件回调 */
  onUIEvent?: (event: ChatSessionUIEvent) => void;
}

/** Session actor ref 类型。 */
type ChatSessionActorRef = NonNullable<ReturnType<ChatActorSystem['getSession']>>;
/** Session snapshot 类型。 */
type ChatSessionSnapshot = ReturnType<ChatSessionActorRef['getSnapshot']>;

/**
 * Session Actor hook 返回值。
 */
export interface UseChatSessionActorReturn {
  /** 当前 Session actor */
  sessionRef: ShallowRef<ChatSessionActorRef | undefined>;
  /** 当前 Session snapshot */
  snapshot: ShallowRef<ChatSessionSnapshot | undefined>;
  /** 当前 Session 是否忙碌 */
  loading: ComputedRef<boolean>;
  /** 当前 Session 是否等待用户 */
  waitingForUser: ComputedRef<boolean>;
  /** 当前 Session 的可恢复交互。 */
  pendingInteraction: ComputedRef<PendingInteraction | undefined>;
  /** 当前 Primary Agent Runtime ID */
  activeRuntimeId: ComputedRef<string | undefined>;
  /** 提交用户消息 */
  submit: (input: ChatSubmitInput) => void;
  /** 提交用户选择 */
  continueWithAnswer: (answer: AIUserChoiceAnswerData) => void;
  /** 从持久化消息恢复用户交互。 */
  recoverInteraction: (interaction: PendingInteraction) => void;
  /** 请求重新生成 */
  regenerate: (targetMessageId: string) => void;
  /** 请求取消 */
  cancel: () => void;
  /** 请求上下文压缩 */
  compact: () => void;
  /** 请求消息回退 */
  rollback: (targetMessageId: string) => void;
  /** 向当前 Session 发送底层领域事件 */
  send: (event: SessionMachineEvent) => void;
  /** 报告 Runtime 准备完成 */
  markPrepared: () => void;
  /** 报告 Runtime 准备失败 */
  markPreparationFailed: (error: ChatWorkflowError) => void;
  /** 报告用户选择续跑启动失败。 */
  markUserChoiceSubmissionFailed: (error: ChatWorkflowError) => void;
  /** 报告 Runtime 完成 */
  markCompleted: () => void;
  /** 报告 Runtime 失败 */
  markFailed: (error: ChatWorkflowError) => void;
  /** 报告 Runtime 已取消 */
  markRuntimeCancelled: () => void;
  /** 报告取消失败 */
  markCancelFailed: (error: ChatWorkflowError) => void;
  /** 报告上下文压缩结果 */
  markCompactFinished: (success: boolean) => void;
  /** 报告消息回退完成 */
  markRollbackCompleted: () => void;
  /** 报告消息回退失败 */
  markRollbackFailed: (error: ChatWorkflowError) => void;
}

/**
 * 订阅当前 BChat Session actor。
 * @param options - 当前会话和 Actor system
 * @returns Session 状态与事件 API
 */
export function useChatSessionActor(options: UseChatSessionActorOptions): UseChatSessionActorReturn {
  const sessionRef = shallowRef<ChatSessionActorRef>();
  const snapshot = shallowRef<ChatSessionSnapshot>();
  let unsubscribeSnapshot: (() => void) | undefined;
  let unsubscribeUIEvents: (() => void) | undefined;

  /** 取消当前 Session 的 renderer 订阅。 */
  function unsubscribeCurrentSession(): void {
    unsubscribeSnapshot?.();
    unsubscribeUIEvents?.();
    unsubscribeSnapshot = undefined;
    unsubscribeUIEvents = undefined;
  }

  watch(
    options.activeSessionId,
    (sessionId: string | null): void => {
      unsubscribeCurrentSession();
      if (!sessionId) {
        sessionRef.value = undefined;
        snapshot.value = undefined;
        return;
      }

      const nextSessionRef = options.actorSystem.ensureSession(sessionId);
      sessionRef.value = nextSessionRef;
      snapshot.value = nextSessionRef.getSnapshot();
      const subscription = nextSessionRef.subscribe((nextSnapshot: ChatSessionSnapshot): void => {
        snapshot.value = nextSnapshot;
      });
      unsubscribeSnapshot = (): void => subscription.unsubscribe();
      unsubscribeUIEvents = options.onUIEvent ? options.actorSystem.subscribeSessionEvents(sessionId, options.onUIEvent) : undefined;
    },
    { immediate: true }
  );

  onScopeDispose(unsubscribeCurrentSession);

  /** 向当前 Session actor 发送事件。 */
  function send(event: SessionMachineEvent): void {
    const activeSessionRef = sessionRef.value ?? (options.activeSessionId.value ? options.actorSystem.ensureSession(options.activeSessionId.value) : undefined);
    activeSessionRef?.send(event);
  }

  /** 提交用户消息。 */
  function submit(input: ChatSubmitInput): void {
    send({ type: 'session.submit', input });
  }

  /** 提交用户选择。 */
  function continueWithAnswer(answer: AIUserChoiceAnswerData): void {
    send({ type: 'session.userChoiceSubmitted', answer });
  }

  /**
   * 仅在当前 Session 空闲时恢复持久化交互。
   * @param interaction - 待恢复交互
   */
  function recoverInteraction(interaction: PendingInteraction): void {
    if (interaction.sessionId !== options.activeSessionId.value) return;
    const activeSessionRef = sessionRef.value ?? options.actorSystem.ensureSession(interaction.sessionId);
    if (!activeSessionRef.getSnapshot().matches('idle')) return;
    activeSessionRef.send({ type: 'session.recoverInteraction', interaction });
  }

  /** 请求重新生成。 */
  function regenerate(targetMessageId: string): void {
    send({ type: 'session.regenerate', targetMessageId });
  }

  /** 请求取消。 */
  function cancel(): void {
    send({ type: 'session.cancelRequested' });
  }

  /** 请求上下文压缩。 */
  function compact(): void {
    send({ type: 'session.compactRequested' });
  }

  /** 请求消息回退。 */
  function rollback(targetMessageId: string): void {
    send({ type: 'session.rollbackRequested', targetMessageId });
  }

  return {
    sessionRef,
    snapshot,
    loading: computed<boolean>(() => snapshot.value?.hasTag('busy') ?? false),
    waitingForUser: computed<boolean>(() => snapshot.value?.hasTag('waitingForUser') ?? false),
    pendingInteraction: computed<PendingInteraction | undefined>(() => snapshot.value?.context.pendingInteraction),
    activeRuntimeId: computed<string | undefined>(
      () => snapshot.value?.context.turnRef?.getSnapshot().context.primaryAgentRef?.getSnapshot().context.runtimeId
    ),
    submit,
    continueWithAnswer,
    recoverInteraction,
    regenerate,
    cancel,
    compact,
    rollback,
    send,
    markPrepared: (): void => send({ type: 'session.prepared' }),
    markPreparationFailed: (error: ChatWorkflowError): void => send({ type: 'session.preparationFailed', error }),
    markUserChoiceSubmissionFailed: (error: ChatWorkflowError): void => send({ type: 'session.userChoiceSubmissionFailed', error }),
    markCompleted: (): void => send({ type: 'session.completed' }),
    markFailed: (error: ChatWorkflowError): void => send({ type: 'session.failed', error }),
    markRuntimeCancelled: (): void => send({ type: 'session.runtimeCancelled' }),
    markCancelFailed: (error: ChatWorkflowError): void => send({ type: 'session.cancelFailed', error }),
    markCompactFinished: (success: boolean): void =>
      send(success ? { type: 'session.compactCompleted' } : { type: 'session.compactFailed', error: { code: 'compact_failed', message: '上下文压缩未完成' } }),
    markRollbackCompleted: (): void => send({ type: 'session.rollbackCompleted' }),
    markRollbackFailed: (error: ChatWorkflowError): void => send({ type: 'session.rollbackFailed', error })
  };
}

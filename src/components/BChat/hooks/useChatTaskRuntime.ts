/**
 * @file useChatTaskRuntime.ts
 * @description 聊天侧边栏统一任务运行时，负责聊天与压缩任务的串行控制、取消与清理。
 */
import { computed, ref } from 'vue';

/**
 * 任务类型。
 */
export type ChatTaskKind = 'chat' | 'compact';

/**
 * 任务状态。
 */
export type ChatTaskState = 'idle' | ChatTaskKind;

/**
 * 任务启动结果。
 */
export interface ChatTaskStartResult {
  /** 是否成功启动任务 */
  ok: boolean;
  /** 压缩任务取消信号 */
  signal?: AbortSignal;
  /** 启动失败原因 */
  reason?: 'busy';
}

/**
 * 统一任务运行时的依赖项。
 */
interface UseChatTaskRuntimeOptions {
  /** 当前活跃聊天任务的中止函数，等待助手消息持久化完成 */
  abortChatTask: () => Promise<void>;
}

/**
 * 统一任务运行时。
 * @param options - 运行时依赖项
 * @returns 统一任务状态与控制方法
 */
export function useChatTaskRuntime(options: UseChatTaskRuntimeOptions) {
  const { abortChatTask } = options;

  /** 当前活跃任务。 */
  const activeTask = ref<ChatTaskState>('idle');
  /** 当前压缩任务的中止控制器。 */
  const compactAbortController = ref<AbortController | null>(null);
  /** 当前压缩任务的中止回调。 */
  const compactAbortHandler = ref<(() => void) | null>(null);

  /**
   * 是否存在活跃任务。
   */
  const loading = computed<boolean>(() => activeTask.value !== 'idle');

  /**
   * 检查内部状态是否一致。
   * chat 任务不应残留压缩控制器；idle 状态也不应残留压缩控制器。
   * @returns 当前状态是否一致
   */
  function isStateConsistent(): boolean {
    if (activeTask.value === 'compact') {
      return Boolean(compactAbortController.value);
    }

    return !compactAbortController.value && !compactAbortHandler.value;
  }

  /**
   * 重置到空闲状态。
   */
  function resetToIdle(): void {
    compactAbortController.value = null;
    compactAbortHandler.value = null;
    activeTask.value = 'idle';
  }

  /**
   * 启动统一任务。
   * @param kind - 任务类型
   * @param onAbort - 任务取消时的清理回调
   * @returns 启动结果；压缩任务会附带取消信号
   */
  function beginTask(kind: ChatTaskKind, onAbort?: () => void): ChatTaskStartResult {
    if (!isStateConsistent()) {
      resetToIdle();
    }

    if (activeTask.value !== 'idle') {
      return { ok: false, reason: 'busy' };
    }

    activeTask.value = kind;
    if (kind === 'compact') {
      compactAbortController.value = new AbortController();
      compactAbortHandler.value = onAbort ?? null;
      return { ok: true, signal: compactAbortController.value.signal };
    }

    compactAbortController.value = null;
    compactAbortHandler.value = null;
    return { ok: true };
  }

  /**
   * 结束指定任务。
   * @param kind - 任务类型
   */
  function finishTask(kind: ChatTaskKind): void {
    if (activeTask.value !== kind) {
      return;
    }

    resetToIdle();
  }

  /**
   * 中止当前活跃任务。
   * 工具循环续轮期间 activeTask 可能已提前置为 idle，仍需保证能中止底层流式传输。
   * 等待聊天任务的助手消息持久化完成后再重置状态，确保数据一致性。
   */
  async function abortActiveTask(): Promise<void> {
    if (activeTask.value === 'compact') {
      compactAbortController.value?.abort();
      compactAbortHandler.value?.();
      resetToIdle();
      return;
    }

    await abortChatTask();
    resetToIdle();
  }

  /**
   * 销毁运行时并清理活跃任务。
   */
  function dispose(): void {
    abortActiveTask();
    resetToIdle();
  }

  return {
    activeTask,
    loading,
    beginTask,
    finishTask,
    abortActiveTask,
    resetToIdle,
    dispose
  };
}

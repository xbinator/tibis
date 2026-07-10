/**
 * @file messageScheduler.ts
 * @description BMessage 解析任务的实例去重与帧预算调度器。
 */
/* eslint-disable no-use-before-define -- 帧刷新与续帧调度存在自然互调。 */

/**
 * 调度任务优先级。
 */
export type MessageRenderPriority = 'high' | 'normal';

/**
 * 帧回调。
 */
export type FrameCallback = () => void;

/**
 * 浏览器或定时器返回的帧句柄。
 */
export type FrameHandle = number | ReturnType<typeof setTimeout>;

/**
 * 待调度的消息渲染任务。
 */
export interface MessageRenderTask {
  /** 组件实例 token。 */
  token: symbol;
  /** 任务优先级。 */
  priority: MessageRenderPriority;
  /** 实际工作。 */
  run: () => void;
}

/**
 * 调度器运行时依赖。
 */
export interface MessageRenderSchedulerRuntime {
  /** 请求下一帧。 */
  requestFrame: (callback: FrameCallback) => FrameHandle;
  /** 取消帧。 */
  cancelFrame: (handle: FrameHandle) => void;
  /** 当前高精度时间。 */
  now: () => number;
  /** 上报单任务异常。 */
  reportError: (error: unknown) => void;
}

/**
 * 消息渲染调度器。
 */
export interface MessageRenderScheduler {
  /** 入队或替换同 token 任务。 */
  enqueue: (task: MessageRenderTask) => void;
  /** 取消 token 对应任务。 */
  cancel: (token: symbol) => void;
}

/**
 * 创建调度器参数。
 */
interface CreateMessageRenderSchedulerOptions {
  /** 可测试运行时。 */
  runtime?: MessageRenderSchedulerRuntime;
  /** 单帧工作预算。 */
  budgetMs?: number;
  /** 单帧最多执行任务数。 */
  maxTasksPerFrame?: number;
}

const DEFAULT_FRAME_BUDGET_MS = 6;
const DEFAULT_MAX_TASKS_PER_FRAME = 4;

/**
 * 创建默认浏览器运行时。
 * @returns 调度器运行时
 */
function createDefaultRuntime(): MessageRenderSchedulerRuntime {
  return {
    requestFrame(callback: FrameCallback): FrameHandle {
      if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
      return setTimeout(callback, 0);
    },
    cancelFrame(handle: FrameHandle): void {
      if (typeof cancelAnimationFrame === 'function' && typeof handle === 'number') {
        cancelAnimationFrame(handle);
        return;
      }
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
    now: (): number => (typeof performance === 'undefined' ? Date.now() : performance.now()),
    reportError(error: unknown): void {
      console.error('[BMessage] render task failed', error);
    }
  };
}

/**
 * 从 Map 取出一个任务。
 * @param queue - 任务队列
 * @param newestFirst - 是否优先取最近入队任务
 * @returns 待执行任务
 */
function takeTask(queue: Map<symbol, MessageRenderTask>, newestFirst: boolean): MessageRenderTask | undefined {
  let entry = queue.entries().next().value as [symbol, MessageRenderTask] | undefined;
  if (newestFirst) {
    for (const candidate of queue.entries()) entry = candidate;
  }
  if (!entry) return undefined;

  queue.delete(entry[0]);
  return entry[1];
}

/**
 * 创建消息渲染调度器。
 * @param options - 调度配置
 * @returns 调度器
 */
export function createMessageRenderScheduler(options: CreateMessageRenderSchedulerOptions = {}): MessageRenderScheduler {
  const runtime = options.runtime ?? createDefaultRuntime();
  const budgetMs = options.budgetMs ?? DEFAULT_FRAME_BUDGET_MS;
  const maxTasksPerFrame = options.maxTasksPerFrame ?? DEFAULT_MAX_TASKS_PER_FRAME;
  const highQueue = new Map<symbol, MessageRenderTask>();
  const normalQueue = new Map<symbol, MessageRenderTask>();
  let frameHandle: FrameHandle | null = null;

  /**
   * 请求队列刷新。
   */
  function scheduleFrame(): void {
    if (frameHandle !== null) return;
    frameHandle = runtime.requestFrame(flushFrame);
  }

  /**
   * 在一帧预算内刷新队列。
   */
  function flushFrame(): void {
    frameHandle = null;
    const startedAt = runtime.now();
    let completedCount = 0;
    let task = takeTask(highQueue, true) ?? takeTask(normalQueue, false);

    while (task) {
      try {
        task.run();
      } catch (error: unknown) {
        runtime.reportError(error);
      }

      completedCount += 1;
      if (completedCount >= maxTasksPerFrame || runtime.now() - startedAt >= budgetMs) break;
      task = takeTask(highQueue, true) ?? takeTask(normalQueue, false);
    }

    if (highQueue.size > 0 || normalQueue.size > 0) scheduleFrame();
  }

  return {
    enqueue(task: MessageRenderTask): void {
      highQueue.delete(task.token);
      normalQueue.delete(task.token);
      (task.priority === 'high' ? highQueue : normalQueue).set(task.token, task);
      scheduleFrame();
    },
    cancel(token: symbol): void {
      highQueue.delete(token);
      normalQueue.delete(token);
    }
  };
}

/**
 * BMessage 共享渲染调度器。
 */
export const messageRenderScheduler = createMessageRenderScheduler();

/**
 * @file runtime.ts
 * @description 可测试的沙箱 Worker 协议运行时。
 */
import type { SandboxWorkerInputMessage, SandboxWorkerOutputMessage } from '../types';
import { createSandboxExecutionContext, executeSandboxCode } from '../core';
import { createSandboxWorkerHostBridge } from './bridge';

/**
 * 沙箱 Worker 协议运行时。
 */
export interface SandboxWorkerRuntime {
  /**
   * 处理一条主线程消息。
   * @param message - Worker 输入消息
   * @returns 消息处理完成信号
   */
  handleMessage: (message: SandboxWorkerInputMessage) => Promise<void>;
}

/**
 * 格式化沙箱错误消息。
 * @param error - 原始错误
 * @returns 可跨线程传输的错误消息
 */
function formatSandboxWorkerError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 创建沙箱 Worker 协议运行时。
 * @param postMessage - 向主线程发送消息
 * @returns Worker 协议运行时
 */
export function createSandboxWorkerRuntime(postMessage: (message: SandboxWorkerOutputMessage) => void): SandboxWorkerRuntime {
  const sandboxExecutionContext = createSandboxExecutionContext();
  const workerHostBridge = createSandboxWorkerHostBridge(postMessage);
  let runQueue: Promise<void> = Promise.resolve();

  /**
   * 执行一轮沙箱代码并发送协议结果。
   * @param message - 当前运行消息
   */
  async function handleRunMessage(message: Extract<SandboxWorkerInputMessage, { type: 'run' }>): Promise<void> {
    workerHostBridge.activate(message.runId);

    try {
      const result = await executeSandboxCode(
        message.payload,
        {
          callHostFunction: workerHostBridge.callHostFunction
        },
        sandboxExecutionContext
      );
      postMessage({
        type: 'done',
        runId: message.runId,
        result
      });
    } catch (error) {
      postMessage({
        type: 'error',
        runId: message.runId,
        message: formatSandboxWorkerError(error)
      });
    } finally {
      workerHostBridge.deactivate(message.runId);
    }
  }

  /**
   * 串行追加一轮沙箱运行。
   * @param message - 当前运行消息
   * @returns 当前运行完成信号
   */
  function enqueueRunMessage(message: Extract<SandboxWorkerInputMessage, { type: 'run' }>): Promise<void> {
    const runTask = (): Promise<void> => handleRunMessage(message);
    const task = runQueue.then(runTask, runTask);

    runQueue = task.catch((): undefined => undefined);

    return task;
  }

  /**
   * 处理主线程协议消息。
   * @param message - Worker 输入消息
   * @returns 消息处理完成信号
   */
  function handleMessage(message: SandboxWorkerInputMessage): Promise<void> {
    if (message.type === 'run') return enqueueRunMessage(message);

    // 宿主响应必须即时处理，否则当前运行会等待自身队列而死锁。
    workerHostBridge.handleHostResponse(message);

    return Promise.resolve();
  }

  return {
    handleMessage
  };
}

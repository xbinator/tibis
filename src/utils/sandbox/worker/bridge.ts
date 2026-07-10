/**
 * @file bridge.ts
 * @description Worker 沙箱跨运行宿主函数桥接器。
 */
import type { SandboxWorkerInputMessage, SandboxWorkerOutputMessage } from '../types';

/**
 * Worker 宿主函数响应消息。
 */
type SandboxWorkerHostResponseMessage = Extract<SandboxWorkerInputMessage, { type: 'host-response' | 'host-error' }>;

/**
 * 等待宿主线程返回的函数调用。
 */
interface PendingHostCall {
  /** 调用所属的沙箱运行 ID。 */
  runId: string;
  /** 完成宿主函数调用。 */
  resolve: (value: unknown) => void;
  /** 拒绝宿主函数调用。 */
  reject: (error: Error) => void;
}

/**
 * Worker 沙箱宿主函数桥接器。
 */
export interface SandboxWorkerHostBridge {
  /**
   * 激活一轮沙箱运行。
   * @param runId - 当前运行 ID
   */
  activate: (runId: string) => void;
  /**
   * 结束一轮沙箱运行。
   * @param runId - 待结束的运行 ID
   */
  deactivate: (runId: string) => void;
  /**
   * 调用当前活跃运行对应的宿主函数。
   * @param name - 宿主函数名
   * @param args - 宿主函数参数
   * @returns 宿主函数返回值
   */
  callHostFunction: (name: string, args: unknown[]) => Promise<unknown>;
  /**
   * 处理宿主函数响应。
   * @param message - 宿主函数响应消息
   */
  handleHostResponse: (message: SandboxWorkerHostResponseMessage) => void;
}

/**
 * 创建可跨运行复用的 Worker 沙箱宿主函数桥接器。
 * @param postMessage - 向宿主线程发送 Worker 消息
 * @returns Worker 沙箱宿主函数桥接器
 */
export function createSandboxWorkerHostBridge(postMessage: (message: SandboxWorkerOutputMessage) => void): SandboxWorkerHostBridge {
  /** 当前活跃运行 ID。 */
  let activeRunId: string | null = null;
  /** 宿主函数调用序号。 */
  let hostCallSeq = 0;
  /** 当前等待宿主线程返回的函数调用。 */
  const pendingHostCalls = new Map<string, PendingHostCall>();

  /**
   * 激活一轮沙箱运行。
   * @param runId - 当前运行 ID
   */
  function activate(runId: string): void {
    activeRunId = runId;
  }

  /**
   * 结束一轮沙箱运行。
   * @param runId - 待结束的运行 ID
   */
  function deactivate(runId: string): void {
    if (activeRunId === runId) activeRunId = null;

    // 一轮结束后不允许遗留宿主调用继续占用内存或串入下一轮。
    for (const [requestId, pendingHostCall] of pendingHostCalls) {
      if (pendingHostCall.runId !== runId) continue;

      pendingHostCalls.delete(requestId);
      pendingHostCall.reject(new Error('沙箱运行已结束'));
    }
  }

  /**
   * 调用当前活跃运行对应的宿主函数。
   * @param name - 宿主函数名
   * @param args - 宿主函数参数
   * @returns 宿主函数返回值
   */
  function callHostFunction(name: string, args: unknown[]): Promise<unknown> {
    const runId = activeRunId;
    if (!runId) return Promise.reject(new Error('沙箱当前没有活跃运行'));

    const pendingCall = new Promise<unknown>((resolve, reject): void => {
      const requestId = `${runId}:host:${hostCallSeq}`;
      hostCallSeq += 1;
      pendingHostCalls.set(requestId, { runId, resolve, reject });
      postMessage({
        type: 'host-call',
        runId,
        requestId,
        name,
        args
      });
    });

    // 桥接器负责生命周期拒绝；调用方仍会收到原 Promise 的拒绝结果。
    pendingCall.catch((): undefined => undefined);

    return pendingCall;
  }

  /**
   * 处理宿主函数响应。
   * @param message - 宿主函数响应消息
   */
  function handleHostResponse(message: SandboxWorkerHostResponseMessage): void {
    const pendingHostCall = pendingHostCalls.get(message.requestId);
    if (!pendingHostCall) return;

    pendingHostCalls.delete(message.requestId);

    if (message.type === 'host-error') {
      pendingHostCall.reject(new Error(message.message));
      return;
    }

    pendingHostCall.resolve(message.value);
  }

  return {
    activate,
    deactivate,
    callHostFunction,
    handleHostResponse
  };
}

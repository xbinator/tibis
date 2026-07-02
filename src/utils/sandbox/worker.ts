/**
 * @file worker.ts
 * @description 通用 JS 沙箱 Worker 入口。
 */
import type { SandboxWorkerInputMessage, SandboxWorkerOutputMessage } from './types';
import { executeSandboxCode } from './core';

/** Worker 内需要禁用的全局能力。 */
const WORKER_BLOCKED_GLOBAL_NAMES = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'SharedWorker',
  'importScripts',
  'postMessage',
  'close',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'eval',
  'Function',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'navigator',
  'location',
  'history',
  'crypto',
  'process',
  'require'
] as const;

/** 宿主函数调用状态。 */
interface PendingHostCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/** 当前等待主线程返回的宿主函数调用。 */
const pendingHostCalls = new Map<string, PendingHostCall>();
/** 宿主函数调用序号。 */
let hostCallSeq = 0;
/** Worker 原始 postMessage 引用，禁用全局 postMessage 后仍用于协议通信。 */
const workerPostMessage = postMessage.bind(globalThis);

/**
 * 禁用 Worker 全局上的直接能力。
 */
function hardenWorkerGlobal(): void {
  for (const name of WORKER_BLOCKED_GLOBAL_NAMES) {
    try {
      Object.defineProperty(globalThis, name, {
        value: undefined,
        writable: false,
        configurable: false
      });
    } catch {
      // 某些宿主内置属性可能不可重定义，忽略后仍有外层参数遮蔽兜底。
    }
  }
}

hardenWorkerGlobal();

/**
 * 向主线程发送消息。
 * @param message - Worker 输出消息
 */
function postWorkerMessage(message: SandboxWorkerOutputMessage): void {
  workerPostMessage(message);
}

/**
 * 格式化错误消息。
 * @param error - 错误对象
 * @returns 错误消息
 */
function formatSandboxError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 创建 Worker 内宿主函数桥接。
 * @param runId - 当前运行 ID
 * @returns 宿主函数调用函数
 */
function createWorkerHostBridge(runId: string): (name: string, args: unknown[]) => Promise<unknown> {
  return (name: string, args: unknown[]): Promise<unknown> =>
    new Promise<unknown>((resolve, reject): void => {
      const requestId = `${runId}:host:${hostCallSeq}`;
      hostCallSeq += 1;
      pendingHostCalls.set(requestId, { resolve, reject });
      postWorkerMessage({
        type: 'host-call',
        runId,
        requestId,
        name,
        args
      });
    });
}

/**
 * 处理运行请求。
 * @param message - 运行请求消息
 */
async function handleRunMessage(message: Extract<SandboxWorkerInputMessage, { type: 'run' }>): Promise<void> {
  try {
    const result = await executeSandboxCode(message.payload, {
      callHostFunction: createWorkerHostBridge(message.runId)
    });
    postWorkerMessage({
      type: 'done',
      runId: message.runId,
      result
    });
  } catch (error) {
    postWorkerMessage({
      type: 'error',
      runId: message.runId,
      message: formatSandboxError(error)
    });
  }
}

/**
 * 处理宿主函数响应消息。
 * @param message - 宿主函数响应消息
 */
function handleHostResponseMessage(message: Extract<SandboxWorkerInputMessage, { type: 'host-response' | 'host-error' }>): void {
  const pendingHostCall = pendingHostCalls.get(message.requestId);
  if (!pendingHostCall) return;

  pendingHostCalls.delete(message.requestId);

  if (message.type === 'host-error') {
    pendingHostCall.reject(new Error(message.message));
    return;
  }

  pendingHostCall.resolve(message.value);
}

globalThis.onmessage = (event: MessageEvent<SandboxWorkerInputMessage>): void => {
  const { data } = event;
  if (data.type === 'run') {
    handleRunMessage(data).catch((error): void => {
      postWorkerMessage({
        type: 'error',
        runId: data.runId,
        message: formatSandboxError(error)
      });
    });
    return;
  }

  handleHostResponseMessage(data);
};

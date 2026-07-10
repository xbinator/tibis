/**
 * @file index.ts
 * @description 通用 JS 沙箱 Worker 入口。
 */
import type { SandboxWorkerInputMessage, SandboxWorkerOutputMessage } from '../types';
import { createSandboxWorkerRuntime } from './runtime';

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

/** Worker 内复用的沙箱协议运行时。 */
const sandboxWorkerRuntime = createSandboxWorkerRuntime(postWorkerMessage);

/**
 * 格式化错误消息。
 * @param error - 错误对象
 * @returns 错误消息
 */
function formatSandboxError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

globalThis.onmessage = (event: MessageEvent<SandboxWorkerInputMessage>): void => {
  const { data } = event;
  sandboxWorkerRuntime.handleMessage(data).catch((error): void => {
    if (data.type === 'run') {
      postWorkerMessage({
        type: 'error',
        runId: data.runId,
        message: formatSandboxError(error)
      });
    }
  });
};

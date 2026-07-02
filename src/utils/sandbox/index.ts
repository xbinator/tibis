/**
 * @file index.ts
 * @description 通用 JS 沙箱运行时入口。
 */
import type {
  SandboxHostFunction,
  SandboxRunOptions,
  SandboxRunPayload,
  SandboxRunResult,
  SandboxWorkerInputMessage,
  SandboxWorkerOutputMessage
} from './types';
import ts from 'typescript';
import { executeSandboxCode } from './core';

export type { SandboxHostFunction, SandboxRunOptions, SandboxRunPayload, SandboxRunResult } from './types';
export { createSandboxHttpHost, SANDBOX_HTTP_HOST_FUNCTION_NAME } from './http';
export type { SandboxHttpHostOptions } from './http';

/** Worker 默认执行超时。 */
const DEFAULT_SANDBOX_TIMEOUT_MS = 30_000;
/** 沙箱运行序号。 */
let sandboxRunSeq = 0;

/**
 * 判断脚本中是否包含不允许的模块语法。
 * @param node - 待检查节点
 * @returns 是否包含不允许语法
 */
function hasBlockedModuleSyntax(node: ts.Node): boolean {
  if (
    ts.isImportDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isExportAssignment(node) ||
    ts.isImportEqualsDeclaration(node) ||
    (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
    (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval')
  ) {
    return true;
  }

  let blocked = false;
  ts.forEachChild(node, (child): void => {
    if (blocked) return;
    blocked = hasBlockedModuleSyntax(child);
  });

  return blocked;
}

/**
 * 编译沙箱脚本。
 * @param code - 原始代码
 * @param fileName - 虚拟文件名
 * @returns 编译后的 JS
 */
export function compileSandboxSource(code: string, fileName = 'sandbox.ts'): string {
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (hasBlockedModuleSyntax(sourceFile)) {
    throw new Error('沙箱 JS 不允许使用 import/export/eval');
  }

  return ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2020,
      noEmitHelpers: true
    },
    fileName,
    reportDiagnostics: false
  }).outputText;
}

/**
 * 编译沙箱载荷。
 * @param payload - 原始载荷
 * @returns 编译后的载荷
 */
function compileSandboxPayload(payload: SandboxRunPayload): SandboxRunPayload {
  return {
    ...payload,
    code: compileSandboxSource(payload.code, 'sandbox.ts')
  };
}

/**
 * 判断当前环境是否可以创建 Worker。
 * @returns 是否可以创建 Worker
 */
function canUseWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof URL !== 'undefined';
}

/**
 * 创建沙箱 Worker。
 * @returns Worker 实例
 */
function createSandboxWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
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
 * 执行宿主函数。
 * @param hostFunctions - 宿主函数表
 * @param name - 宿主函数名
 * @param args - 调用参数
 * @returns 宿主函数返回值
 */
function runHostFunction(hostFunctions: Record<string, SandboxHostFunction> | undefined, name: string, args: unknown[]): Promise<unknown> {
  const hostFunction = hostFunctions?.[name];
  if (!hostFunction) {
    return Promise.reject(new Error(`沙箱宿主函数不存在：${name}`));
  }

  return Promise.resolve(hostFunction(...args));
}

/**
 * 在本地 fallback 中运行沙箱。
 * @param payload - 已编译载荷
 * @param options - 运行选项
 * @returns 运行结果
 */
function runSandboxLocally(payload: SandboxRunPayload, options: SandboxRunOptions = {}): Promise<SandboxRunResult> {
  return executeSandboxCode(payload, {
    callHostFunction: (name: string, args: unknown[]): Promise<unknown> => runHostFunction(options.hostFunctions, name, args)
  });
}

/**
 * 在 Worker 中运行沙箱。
 * @param payload - 已编译载荷
 * @param options - 运行选项
 * @returns 运行结果
 */
function runSandboxInWorker(payload: SandboxRunPayload, options: SandboxRunOptions = {}): Promise<SandboxRunResult> {
  const worker = createSandboxWorker();
  const runId = `sandbox-${Date.now()}-${sandboxRunSeq}`;
  sandboxRunSeq += 1;

  return new Promise<SandboxRunResult>((resolve, reject): void => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    /**
     * 完成当前 Worker 运行。
     * @param callback - 完成回调
     */
    function settle(callback: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      callback();
    }

    timeout = setTimeout((): void => {
      settle(() => reject(new Error('沙箱 JS 执行超时')));
    }, options.timeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<SandboxWorkerOutputMessage>): void => {
      const { data } = event;
      if (data.type === 'done') {
        settle((): void => resolve(data.result));
        return;
      }

      if (data.type === 'error') {
        settle((): void => reject(new Error(data.message)));
        return;
      }

      runHostFunction(options.hostFunctions, data.name, data.args)
        .then((value): void => {
          const message: SandboxWorkerInputMessage = {
            type: 'host-response',
            requestId: data.requestId,
            value
          };
          worker.postMessage(message);
        })
        .catch((error): void => {
          const message: SandboxWorkerInputMessage = {
            type: 'host-error',
            requestId: data.requestId,
            message: formatSandboxError(error)
          };
          worker.postMessage(message);
        });
    };

    worker.onerror = (event): void => {
      settle((): void => reject(new Error(event.message || '沙箱 Worker 执行失败')));
    };

    const message: SandboxWorkerInputMessage = {
      type: 'run',
      runId,
      payload
    };
    worker.postMessage(message);
  });
}

/**
 * 运行通用沙箱 JS。
 * @param payload - 运行载荷
 * @param options - 运行选项
 * @returns 运行结果
 */
export function runSandboxCode(payload: SandboxRunPayload, options: SandboxRunOptions = {}): Promise<SandboxRunResult> {
  const compiledPayload = {
    ...compileSandboxPayload(payload),
    hostFunctionNames: Object.keys(options.hostFunctions ?? {})
  };

  if (options.useWorker === false) {
    return runSandboxLocally(compiledPayload, options);
  }

  if (!canUseWorker()) {
    return Promise.reject(new Error('当前环境不支持 Worker，无法运行沙箱 JS'));
  }

  return runSandboxInWorker(compiledPayload, options);
}

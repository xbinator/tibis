/**
 * @file core.ts
 * @description 通用 JS 沙箱核心执行器，可在 Worker 或本地 fallback 中运行。
 */
import type { SandboxExecutionBridge, SandboxExecutionContext, SandboxRunPayload, SandboxRunResult, SandboxRuntimeHelpers } from './types';

/** 沙箱内遮蔽的全局标识符。 */
const SANDBOX_SHADOW_NAMES = [
  'globalThis',
  'window',
  'self',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'SharedWorker',
  'navigator',
  'location',
  'history',
  'crypto',
  'process',
  'require',
  'module',
  'exports',
  'importScripts',
  'Function',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'alert',
  'confirm',
  'prompt',
  'open'
] as const;

/** 沙箱内部用于创建隔离函数的 Function 引用。 */
const SandboxFunction = Function;

/** 不能作为注入变量名的保留字。 */
const RESERVED_BINDING_NAMES = new Set([
  'arguments',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'with',
  'yield'
]);

/**
 * 深拷贝沙箱可传递值。
 * @param value - 原始值
 * @returns 拷贝后的值
 */
function cloneSandboxValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value) as T;
    } catch {
      // 不可 structuredClone 的值回退到 JSON 纯数据，避免透传宿主引用。
    }
  }

  if (value === undefined) return value;

  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 判断标识符是否能安全注入为局部变量。
 * @param name - 待判断名称
 * @returns 是否为可用标识符
 */
function isUsableBindingName(name: string): boolean {
  return /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(name) && !RESERVED_BINDING_NAMES.has(name) && !(SANDBOX_SHADOW_NAMES as readonly string[]).includes(name);
}

/**
 * 校验注入变量名。
 * @param names - 待校验名称
 */
function assertUsableBindingNames(names: string[]): void {
  const usedNames = new Set<string>();
  for (const name of names) {
    if (!isUsableBindingName(name)) {
      throw new Error(`沙箱变量名不可用：${name}`);
    }

    if (usedNames.has(name)) {
      throw new Error(`沙箱变量名重复：${name}`);
    }

    usedNames.add(name);
  }
}

/**
 * 创建每次脚本运行独立的遮蔽全局值。
 * @returns 与 SANDBOX_SHADOW_NAMES 对齐的参数值
 */
function createSandboxShadowValues(): unknown[] {
  return SANDBOX_SHADOW_NAMES.map((name): unknown => {
    if (name === 'globalThis') {
      return Object.create(null);
    }

    return undefined;
  });
}

/**
 * 创建沙箱执行上下文。
 * @returns 可复用于多次执行的沙箱上下文
 */
export function createSandboxExecutionContext(): SandboxExecutionContext {
  return {
    shadowValues: createSandboxShadowValues()
  };
}

/**
 * 创建沙箱函数。
 * @param parameters - 参数名
 * @param body - 函数体
 * @returns 可执行函数
 */
function createSandboxFunction(parameters: string[], body: string): (...args: unknown[]) => unknown {
  return SandboxFunction(...parameters, body) as (...args: unknown[]) => unknown;
}

/**
 * 创建内部沙箱函数。
 * @param parameters - 参数名
 * @param body - 函数体
 * @returns 可执行函数
 */
function createInnerSandboxFunction(parameters: string[], body: string, context: SandboxExecutionContext): (...args: unknown[]) => unknown {
  assertUsableBindingNames(parameters);
  const fn = createSandboxFunction([...parameters, ...SANDBOX_SHADOW_NAMES], `"use strict";\n${body}`);

  return (...args: unknown[]): unknown => fn(...args, ...context.shadowValues);
}

/**
 * 创建可被沙箱调用的宿主函数代理。
 * @param name - 宿主函数名
 * @param bridge - 沙箱桥接
 * @returns 宿主函数代理
 */
function createHostFunctionProxy(name: string, bridge: SandboxExecutionBridge): (...args: unknown[]) => Promise<unknown> {
  return async (...args: unknown[]): Promise<unknown> => {
    const value = await bridge.callHostFunction(name, cloneSandboxValue(args));

    return cloneSandboxValue(value);
  };
}

/**
 * 创建沙箱运行辅助对象。
 * @returns 沙箱辅助对象
 */
function createSandboxHelpers(context: SandboxExecutionContext): SandboxRuntimeHelpers {
  return {
    createFunction: (parameters: string[], body: string): ((...args: unknown[]) => unknown) => createInnerSandboxFunction(parameters, body, context)
  };
}

/**
 * 执行通用沙箱代码。
 * @param payload - 已编译运行载荷
 * @param bridge - 执行桥接
 * @returns 运行结果
 */
export async function executeSandboxCode(
  payload: SandboxRunPayload,
  bridge: SandboxExecutionBridge,
  context: SandboxExecutionContext = createSandboxExecutionContext()
): Promise<SandboxRunResult> {
  const sandboxArguments = cloneSandboxValue(payload.arguments ?? {});
  const argumentNames = Object.keys(sandboxArguments);
  const hostFunctionNames = payload.hostFunctionNames ?? [];
  assertUsableBindingNames([...argumentNames, ...hostFunctionNames, '__sandbox']);

  const argumentValues = argumentNames.map((name): unknown => sandboxArguments[name]);
  const hostFunctionValues = hostFunctionNames.map((name): ((...args: unknown[]) => Promise<unknown>) => createHostFunctionProxy(name, bridge));
  const parameters = [...argumentNames, ...hostFunctionNames, '__sandbox', ...SANDBOX_SHADOW_NAMES];
  const values = [...argumentValues, ...hostFunctionValues, createSandboxHelpers(context), ...context.shadowValues];
  const fn = createSandboxFunction(parameters, `"use strict";\nreturn (async function() {\n${payload.code}\n}).call(undefined);`);
  const value = await fn(...values);

  return {
    value: cloneSandboxValue(value)
  };
}

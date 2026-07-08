/**
 * @file types.ts
 * @description 通用 JS 沙箱运行时跨线程协议类型。
 */

/** 沙箱可注入的命名参数。 */
export type SandboxArguments = Record<string, unknown>;

/**
 * 宿主函数。
 */
export type SandboxHostFunction = (...args: unknown[]) => unknown | Promise<unknown>;

/**
 * 沙箱运行载荷。
 */
export interface SandboxRunPayload {
  /** 已编译的 JS 代码，代码位于 async function 内部，可直接 return。 */
  code: string;
  /** 注入到脚本作用域的命名参数。 */
  arguments?: SandboxArguments;
  /** Worker 内需要桥接到宿主线程的函数名。 */
  hostFunctionNames?: string[];
}

/**
 * 沙箱运行结果。
 */
export interface SandboxRunResult {
  /** 脚本 return 的结构化结果。 */
  value: unknown;
}

/**
 * 沙箱运行选项。
 */
export interface SandboxRunOptions {
  /** 提供给沙箱调用的宿主函数。 */
  hostFunctions?: Record<string, SandboxHostFunction>;
  /** 是否使用 Worker，默认自动检测。 */
  useWorker?: boolean;
  /** Worker 执行超时，默认 30000ms。 */
  timeoutMs?: number;
}

/**
 * 沙箱执行上下文。
 */
export interface SandboxExecutionContext {
  /** 同一个沙箱上下文内复用的遮蔽全局变量值。 */
  shadowValues: unknown[];
}

/**
 * 可连续运行多段脚本的沙箱 session。
 */
export interface SandboxSession {
  /**
   * 在当前 session 中运行脚本。
   * @param payload - 运行载荷
   * @returns 沙箱运行结果
   */
  run(payload: SandboxRunPayload): Promise<SandboxRunResult>;
  /**
   * 销毁当前 session。
   */
  dispose(): void;
}

/**
 * 沙箱执行桥接接口。
 */
export interface SandboxExecutionBridge {
  /**
   * 调用宿主函数。
   * @param name - 宿主函数名
   * @param args - 调用参数
   * @returns 宿主函数返回值
   */
  callHostFunction(name: string, args: unknown[]): Promise<unknown>;
}

/**
 * 沙箱内部辅助函数。
 */
export interface SandboxRuntimeHelpers {
  /**
   * 在同一套遮蔽全局规则下创建内部函数。
   * @param parameters - 参数名
   * @param body - 函数体
   * @returns 可执行函数
   */
  createFunction(parameters: string[], body: string): (...args: unknown[]) => unknown;
}

/**
 * 主线程发送给 Worker 的消息。
 */
export type SandboxWorkerInputMessage =
  | {
      type: 'run';
      runId: string;
      payload: SandboxRunPayload;
    }
  | {
      type: 'host-response';
      requestId: string;
      value: unknown;
    }
  | {
      type: 'host-error';
      requestId: string;
      message: string;
    };

/**
 * Worker 发送给主线程的消息。
 */
export type SandboxWorkerOutputMessage =
  | {
      type: 'done';
      runId: string;
      result: SandboxRunResult;
    }
  | {
      type: 'error';
      runId: string;
      message: string;
    }
  | {
      type: 'host-call';
      runId: string;
      requestId: string;
      name: string;
      args: unknown[];
    };

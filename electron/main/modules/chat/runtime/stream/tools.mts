/**
 * @file stream/tools.mts
 * @description ChatRuntime 流式执行器工具执行与结果工厂。
 */
import type { ActiveChatRuntime, ChatRuntimeMainToolExecutor, ChatRuntimeRendererToolExecutor } from '../types.mjs';
import type { AIToolExecutionError, AIToolExecutionResult } from 'types/ai';
import { AI_ERROR_CODE, createAIServiceError, isAIServiceError } from '../../../ai/errors/codes.mjs';
import { MAIN_PROCESS_TOOL_NAMES } from '../tools/constants.mjs';

/**
 * 判断值是否为对象记录。
 * @param value - 待判断值
 * @returns 是否为对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Renderer 本地工具默认超时时间。 */
export const DEFAULT_RENDERER_TOOL_TIMEOUT_MS = 60_000;

/** 可透传到工具失败结果的稳定错误码。 */
const TOOL_EXECUTION_ERROR_CODES: ReadonlySet<AIToolExecutionError['code']> = new Set([
  'INVALID_INPUT',
  'NO_ACTIVE_DOCUMENT',
  'NO_SELECTION',
  'NO_CURSOR',
  'PERMISSION_DENIED',
  'USER_CANCELLED',
  'EDITOR_UNAVAILABLE',
  'STALE_CONTEXT',
  'TOOL_TIMEOUT',
  'UNSUPPORTED_PROVIDER',
  'CONFIRMATION_DISMISSED',
  'EXECUTION_FAILED'
] satisfies AIToolExecutionError['code'][]);

/**
 * 将异常规范化为 AIServiceError。
 * @param error - 原始错误
 * @returns AI 服务错误
 */
export function normalizeRuntimeError(error: unknown): ReturnType<typeof createAIServiceError> {
  if (isAIServiceError(error)) return error;
  if (error instanceof Error) return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, error.message);

  return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, 'ChatRuntime 流式调用失败');
}

/**
 * 从未知错误中读取可用于工具结果的稳定错误码。
 * @param error - 原始异常
 * @returns 工具错误码
 */
export function getToolExecutionErrorCode(error: unknown): AIToolExecutionError['code'] {
  if (isRecord(error) && typeof error.code === 'string' && TOOL_EXECUTION_ERROR_CODES.has(error.code as AIToolExecutionError['code'])) {
    return error.code as AIToolExecutionError['code'];
  }

  return 'EXECUTION_FAILED';
}

/**
 * 将工具异常转为工具失败结果。
 * @param toolName - 工具名称
 * @param error - 原始异常
 * @returns 工具失败结果
 */
export function createToolFailureResultFromError(toolName: string, error: unknown): AIToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    toolName,
    status: 'failure',
    error: {
      code: getToolExecutionErrorCode(error),
      message
    }
  };
}

/**
 * 创建 renderer 工具超时结果。
 * @param toolName - 工具名称
 * @param timeoutMs - 超时时间
 * @returns 工具失败结果
 */
export function createRendererToolTimeoutResult(toolName: string, timeoutMs: number): AIToolExecutionResult {
  return {
    toolName,
    status: 'failure',
    error: {
      code: 'TOOL_TIMEOUT',
      message: `Renderer 工具 ${toolName} 执行超时，已等待 ${timeoutMs}ms`
    }
  };
}

/**
 * 创建主进程工具超时结果。
 * @param toolName - 工具名称
 * @param timeoutMs - 超时时间
 * @returns 工具失败结果
 */
export function createMainToolTimeoutResult(toolName: string, timeoutMs: number): AIToolExecutionResult {
  return {
    toolName,
    status: 'failure',
    error: {
      code: 'TOOL_TIMEOUT',
      message: `主进程工具 ${toolName} 执行超时，已等待 ${timeoutMs}ms`
    }
  };
}

/**
 * 创建未注册工具的失败结果。
 * @param toolName - 工具名称
 * @returns 工具失败结果
 */
export function createUnknownToolFailureResult(toolName: string): AIToolExecutionResult {
  return {
    toolName,
    status: 'failure',
    error: {
      code: 'TOOL_NOT_FOUND',
      message: `未找到工具 ${toolName} 的执行器，既不是主进程工具也未在 runtime.tools 中注册`
    }
  };
}

/**
 * 规整 renderer 工具超时时间。
 * @param timeoutMs - 原始超时时间
 * @returns 可使用的超时时间
 */
export function normalizeRendererToolTimeoutMs(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return DEFAULT_RENDERER_TOOL_TIMEOUT_MS;

  return Math.floor(timeoutMs);
}

/**
 * 判断工具结果是否允许 runtime 进入下一轮续跑。
 * @param result - 工具执行结果
 * @returns 是否继续工具续轮
 */
export function shouldContinueAfterToolResult(result: AIToolExecutionResult): boolean {
  return result.status !== 'awaiting_user_input' && result.status !== 'cancelled';
}

/**
 * 判断工具结果是否应停止继续消费当前模型流。
 * @param result - 工具执行结果
 * @returns 是否停止当前模型流
 */
export function shouldStopStreamAfterToolResult(result: AIToolExecutionResult): boolean {
  return result.status === 'awaiting_user_input' || result.status === 'cancelled';
}

/**
 * 执行 renderer 本地工具，并把异常或超时转换为工具失败结果。
 * @param executeRendererTool - renderer 工具执行器
 * @param input - renderer 工具输入
 * @param timeoutMs - 超时时间
 * @returns 工具执行结果
 */
export async function executeRendererToolSafely(
  executeRendererTool: ChatRuntimeRendererToolExecutor,
  input: Parameters<ChatRuntimeRendererToolExecutor>[0],
  timeoutMs: number
): Promise<AIToolExecutionResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      executeRendererTool(input),
      new Promise<AIToolExecutionResult>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve(createRendererToolTimeoutResult(input.toolName, timeoutMs));
        }, timeoutMs);
      })
    ]);
  } catch (error: unknown) {
    return createToolFailureResultFromError(input.toolName, error);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 执行主进程工具，并把异常或超时转换为工具失败结果。
 * @param executeMainTool - 主进程工具执行器
 * @param input - 主进程工具输入
 * @param timeoutMs - 超时时间
 * @returns 工具执行结果
 */
export async function executeMainToolSafely(
  executeMainTool: ChatRuntimeMainToolExecutor,
  input: Parameters<ChatRuntimeMainToolExecutor>[0],
  timeoutMs: number
): Promise<AIToolExecutionResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      executeMainTool(input),
      new Promise<AIToolExecutionResult>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve(createMainToolTimeoutResult(input.toolName, timeoutMs));
        }, timeoutMs);
      })
    ]);
  } catch (error: unknown) {
    return createToolFailureResultFromError(input.toolName, error);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 判断工具是否由主进程执行。
 * @param toolName - 工具名称
 * @returns 是否为主进程工具
 */
export function isMainProcessTool(toolName: string): boolean {
  return MAIN_PROCESS_TOOL_NAMES.has(toolName);
}

/**
 * 判断工具是否由 renderer 本地执行。
 * @param runtime - runtime 状态
 * @param toolName - 工具名称
 * @returns 是否为 renderer 工具
 */
export function isRendererManagedTool(runtime: ActiveChatRuntime, toolName: string): boolean {
  return !isMainProcessTool(toolName) && Boolean(runtime.tools?.some((tool) => tool.name === toolName));
}

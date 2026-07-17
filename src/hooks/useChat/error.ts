/**
 * @file error.ts
 * @description ChatRuntime 错误码、工具失败结果、Workflow 错误的统一转换辅助。
 */
import type { AIServiceError, AIToolExecutionError, AIToolExecutionResult } from 'types/ai';
import type { ChatRuntimeBridgeResult, ChatRuntimeHandlerResult } from 'types/chat-runtime';
import type { ChatActorSystem } from '@/ai/chat/actorSystem';
import type { ChatWorkflowError } from '@/ai/chat/types';

/** Runtime renderer 工具可透传错误码。 */
const RUNTIME_TOOL_ERROR_CODES: AIToolExecutionError['code'][] = [
  'TOOL_NOT_FOUND',
  'INVALID_INPUT',
  'NO_ACTIVE_DOCUMENT',
  'NO_SELECTION',
  'NO_CURSOR',
  'PERMISSION_DENIED',
  'USER_CANCELLED',
  'EDITOR_UNAVAILABLE',
  'STALE_CONTEXT',
  'STALE_SNAPSHOT',
  'PAGE_LOADING',
  'ELEMENT_NOT_FOUND',
  'ACTION_NOT_SUPPORTED',
  'OPTION_AMBIGUOUS',
  'SCROLL_TARGET_NOT_FOUND',
  'BRIDGE_TIMEOUT',
  'TOOL_TIMEOUT',
  'UNSUPPORTED_PROVIDER',
  'CONFIRMATION_DISMISSED',
  'EXECUTION_FAILED'
];

/**
 * 判断 Runtime 是否已经由 Actor system 接管。
 * @param actorSystem - Chat Actor system
 * @param runtimeId - Runtime ID
 * @returns 是否已注册
 */
export function isManagedRuntime(actorSystem: ChatActorSystem, runtimeId: string): boolean {
  return actorSystem.actor.getSnapshot().context.runtimeRoutes.has(runtimeId);
}

/**
 * 判断错误码是否可作为工具稳定错误码。
 * @param code - 未知错误码
 * @returns 是否为稳定工具错误码
 */
export function isRuntimeToolErrorCode(code: unknown): code is AIToolExecutionError['code'] {
  return typeof code === 'string' && RUNTIME_TOOL_ERROR_CODES.includes(code as AIToolExecutionError['code']);
}

/**
 * 将未知错误转换为工具失败结果。
 * @param toolName - 工具名称
 * @param error - 原始错误
 * @returns 工具失败结果
 */
export function createToolFailure(toolName: string, error: unknown): AIToolExecutionResult {
  const rawCode = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;

  return {
    toolName,
    status: 'failure',
    error: {
      code: isRuntimeToolErrorCode(rawCode) ? rawCode : 'EXECUTION_FAILED',
      message: error instanceof Error ? error.message : String(error)
    }
  };
}

/**
 * 将 Bridge 错误转换为稳定结果。
 * @param error - 原始错误
 * @returns Bridge 失败结果
 */
export function createBridgeFailure(error: unknown): ChatRuntimeBridgeResult {
  const rawCode = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;

  return {
    status: 'failure',
    error: {
      code: isRuntimeToolErrorCode(rawCode) ? rawCode : 'EXECUTION_FAILED',
      message: error instanceof Error ? error.message : String(error)
    }
  };
}

/**
 * 将 Runtime 错误转换为 Actor 流程错误。
 * @param error - Runtime 错误
 * @returns Actor 流程错误
 */
export function createWorkflowError(error: AIServiceError): ChatWorkflowError {
  return {
    code: 'runtime_failed',
    message: error.message,
    cause: error
  };
}

/**
 * 确保 Runtime IPC 命令成功。
 * @param result - Runtime handler 结果
 */
export function assertRuntimeResult(result: ChatRuntimeHandlerResult<void>): void {
  if (!result.ok) {
    throw new Error(result.error ?? 'ChatRuntime request failed');
  }
}

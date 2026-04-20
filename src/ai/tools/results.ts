/**
 * @file results.ts
 * @description AI 工具执行结果工厂函数
 */
import type { AIToolExecutionError, AIToolExecutionResult } from 'types/ai';

/**
 * 创建成功的工具执行结果
 * @param toolName - 工具名称
 * @param data - 返回的数据
 * @returns 成功的执行结果
 */
export function createToolSuccessResult<TResult>(toolName: string, data: TResult): AIToolExecutionResult<TResult> {
  return { toolName, status: 'success', data };
}

/**
 * 创建失败的工具执行结果
 * @param toolName - 工具名称
 * @param code - 错误代码
 * @param message - 错误消息
 * @returns 失败的执行结果
 */
export function createToolFailureResult(toolName: string, code: AIToolExecutionError['code'], message: string): AIToolExecutionResult<never> {
  return { toolName, status: 'failure', error: { code, message } };
}

/**
 * 创建失败或取消类型的执行结果
 * @param toolName - 工具名称
 * @param status - 状态（failure 或 cancelled）
 * @param code - 错误代码
 * @param message - 错误消息
 * @returns 执行结果
 */
function createFailureLikeResult(
  toolName: string,
  status: 'failure' | 'cancelled',
  code: AIToolExecutionError['code'],
  message: string
): AIToolExecutionResult<never> {
  return { toolName, status, error: { code, message } };
}

/**
 * 创建用户取消的工具执行结果
 * @param toolName - 工具名称
 * @returns 取消的执行结果
 */
export function createToolCancelledResult(toolName: string): AIToolExecutionResult<never> {
  return createFailureLikeResult(toolName, 'cancelled', 'USER_CANCELLED', '用户取消了工具调用');
}

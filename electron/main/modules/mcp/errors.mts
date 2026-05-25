/**
 * @file errors.mts
 * @description MCP 错误分类与判断工具。
 */
import type { MCPRuntimeStatus } from 'types/ai';

/**
 * MCP 稳定错误码。
 */
export type McpErrorCode = 'AUTH_REQUIRED' | 'CLIENT_REGISTRATION_REQUIRED' | 'TIMEOUT' | 'NETWORK_ERROR' | 'PROCESS_EXITED' | 'CONNECTION_FAILED';

/**
 * MCP 错误分类结果。
 */
export interface McpErrorClassification {
  /** 稳定错误码 */
  code: McpErrorCode;
  /** 对应的运行状态 */
  status: MCPRuntimeStatus;
  /** 原始错误消息 */
  message: string;
}

/**
 * 将未知错误归类为稳定错误码与运行状态。
 * @param error - 原始错误
 * @returns 错误分类结果
 */
export function classifyMcpError(error: unknown): McpErrorClassification {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('401') || lower.includes('unauthorized')) {
    if (lower.includes('client registration') || lower.includes('registration_required')) {
      return { code: 'CLIENT_REGISTRATION_REQUIRED', status: 'needs_client_registration', message };
    }
    return { code: 'AUTH_REQUIRED', status: 'needs_auth', message };
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return { code: 'TIMEOUT', status: 'failed', message };
  }

  if (lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('enotfound') || lower.includes('network')) {
    return { code: 'NETWORK_ERROR', status: 'failed', message };
  }

  if (lower.includes('process exited') || lower.includes('code=')) {
    return { code: 'PROCESS_EXITED', status: 'failed', message };
  }

  return { code: 'CONNECTION_FAILED', status: 'failed', message };
}

/**
 * 判断错误是否为 OAuth 认证相关。
 * @param error - 原始错误
 * @returns 是否为 OAuth 错误
 */
export function isOAuthError(error: unknown): boolean {
  const { code } = classifyMcpError(error);
  return code === 'AUTH_REQUIRED' || code === 'CLIENT_REGISTRATION_REQUIRED';
}

/**
 * 判断错误是否可重试。
 * @param error - 原始错误
 * @returns 是否可重试
 */
export function isRetryable(error: unknown): boolean {
  const { code } = classifyMcpError(error);
  return code === 'TIMEOUT' || code === 'NETWORK_ERROR' || code === 'CONNECTION_FAILED';
}

/**
 * @file asyncTo.ts
 * @description 将 Promise 结果转换为错误优先元组，并统一未知异常结构。
 */

/** 未提供有效错误码时使用的稳定错误码。 */
const DEFAULT_ERROR_CODE = 'UNKNOWN';

/** 未提供有效错误消息时使用的兜底文案。 */
const DEFAULT_ERROR_MESSAGE = '未知错误';

/**
 * asyncTo 返回的统一错误。
 */
export class AsyncToError extends Error {
  /** 稳定错误码。 */
  readonly code: string;

  /**
   * 创建统一错误。
   * @param message - 可展示的错误消息
   * @param code - 稳定错误码
   * @param cause - 原始异常值
   */
  constructor(message: string, code: string, cause: unknown) {
    super(message, { cause });
    this.name = 'AsyncToError';
    this.code = code;
  }
}

/**
 * 判断值是否为可读取字段的对象。
 * @param value - 待判断值
 * @returns 是否为对象记录
 */
function isErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 安全读取未知错误对象的字段，避免 getter 或 Proxy 再次抛错。
 * @param error - 原始异常值
 * @param field - 待读取字段
 * @returns 字段值；无法读取时返回 undefined
 */
function readErrorField(error: unknown, field: 'message' | 'code'): unknown {
  if (!isErrorRecord(error)) return undefined;

  try {
    return error[field];
  } catch {
    return undefined;
  }
}

/**
 * 从未知异常中读取统一消息。
 * @param error - 原始异常值
 * @returns 非空错误消息
 */
function readErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error.trim();
  const message = readErrorField(error, 'message');
  if (typeof message === 'string' && message.trim()) return message.trim();
  return DEFAULT_ERROR_MESSAGE;
}

/**
 * 从未知异常中读取统一错误码。
 * @param error - 原始异常值
 * @returns 字符串错误码
 */
function readErrorCode(error: unknown): string {
  const code = readErrorField(error, 'code');
  if (typeof code === 'string' && code.trim()) return code.trim();
  return DEFAULT_ERROR_CODE;
}

/**
 * 将任意异常归一化为带错误码的真实 Error。
 * @param error - 原始异常值
 * @returns 统一错误对象
 */
export function normalizeError(error: unknown): AsyncToError {
  return new AsyncToError(readErrorMessage(error), readErrorCode(error), error);
}

/**
 * 将 Promise 结果转换为错误优先元组。
 * @param promise - 待执行的 Promise
 * @returns 失败时返回统一错误，成功时返回结果
 */
export async function asyncTo<T>(promise: Promise<T>): Promise<[AsyncToError] | [undefined, T]> {
  try {
    return [undefined, await promise];
  } catch (error: unknown) {
    return [normalizeError(error)];
  }
}

/**
 * @file errors.mts
 * @description ChatRuntime 稳定错误类型。
 */

/** Runtime 稳定错误。 */
export class ChatRuntimeError extends Error {
  /** 稳定错误码。 */
  code: string;

  /**
   * 创建 runtime 错误。
   * @param code - 稳定错误码
   * @param message - 错误描述
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ChatRuntimeError';
    this.code = code;
  }
}

/**
 * @file common.test.ts
 * @description AI 服务通用错误映射测试。
 */
import { describe, expect, it } from 'vitest';
import { mapCommonError } from '@/../electron/main/modules/ai/errors/common.mjs';

/**
 * 创建带 message 的上游错误。
 * @param message - 上游错误消息
 * @returns Error 实例
 */
function createUpstreamError(message: string): Error {
  return new Error(message);
}

describe('mapCommonError', () => {
  it('maps insufficient balance errors to exhausted quota message', (): void => {
    const error = mapCommonError(createUpstreamError('Insufficient Balance'), '服务调用失败');

    expect(error).toEqual({
      code: 'RATE_LIMITED',
      message: '请求过于频繁或额度已耗尽，请稍后重试'
    });
  });
});

/**
 * @file async-to.test.ts
 * @description Promise 元组工具的错误归一化测试。
 */
import { describe, expect, it } from 'vitest';
import { asyncTo } from '@/utils/asyncTo';

/**
 * 模拟读取错误字段时再次抛出的异常对象。
 * @returns 永不返回
 */
function throwOnRead(): never {
  throw new Error('属性读取失败');
}

describe('asyncTo', (): void => {
  it('normalizes an error-like object with its message', async (): Promise<void> => {
    const rejection = { message: '创建会话分支失败', code: 'SQLITE_CONSTRAINT' };

    const [error, result] = await asyncTo(Promise.reject(rejection));

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('创建会话分支失败');
    expect(error?.cause).toBe(rejection);
    expect(result).toBeUndefined();
  });

  it('preserves an Error as its cause', async (): Promise<void> => {
    const rejection = new TypeError('参数无效');

    const [error] = await asyncTo(Promise.reject(rejection));

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('参数无效');
    expect(error?.cause).toBe(rejection);
  });

  it('uses a rejected string as the normalized message', async (): Promise<void> => {
    // 模拟第三方 Promise 直接使用字符串作为拒绝原因。
    // eslint-disable-next-line prefer-promise-reject-errors
    const [error] = await asyncTo(Promise.reject('网络连接失败'));

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('网络连接失败');
    expect(error?.cause).toBe('网络连接失败');
  });

  it('uses the fallback message for an empty rejection', async (): Promise<void> => {
    // 模拟第三方 Promise 未提供任何有效拒绝原因。
    // eslint-disable-next-line prefer-promise-reject-errors
    const [error] = await asyncTo(Promise.reject(null));

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('未知错误');
    expect(error?.cause).toBe(null);
  });

  it('keeps normalizing when the message getter throws', async (): Promise<void> => {
    const rejection = Object.defineProperty({ code: 'MESSAGE_GETTER_FAILED' }, 'message', { get: throwOnRead });

    const [error] = await asyncTo(Promise.reject(rejection));

    expect(error?.message).toBe('未知错误');
    expect(error?.cause).toBe(rejection);
  });

  it('keeps normalizing when the code getter throws', async (): Promise<void> => {
    const rejection = Object.defineProperty({ message: '仍可展示的错误' }, 'code', { get: throwOnRead });

    const [error] = await asyncTo(Promise.reject(rejection));

    expect(error?.message).toBe('仍可展示的错误');
    expect(error?.cause).toBe(rejection);
  });

  it('normalizes a revoked Proxy without rejecting again', async (): Promise<void> => {
    const { proxy, revoke } = Proxy.revocable<Record<string, unknown>>({}, {});
    revoke();

    const [error] = await asyncTo(Promise.reject(proxy));

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('未知错误');
    expect(error?.cause).toBe(proxy);
  });
});

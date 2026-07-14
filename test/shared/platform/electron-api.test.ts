/**
 * @file electron-api.test.ts
 * @description Electron API 结果解包与错误信息透传测试。
 */
import { describe, expect, it } from 'vitest';
import { unwrap } from '@/shared/platform/electron-api';

describe('electron-api unwrap', (): void => {
  it('preserves the failure code on the thrown Error', (): void => {
    const failure = { ok: false as const, error: '分支写入失败', code: 'SQLITE_CONSTRAINT' };
    let thrownError: unknown;

    try {
      unwrap<never>(failure);
    } catch (error: unknown) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError).toMatchObject({
      message: '分支写入失败',
      code: 'SQLITE_CONSTRAINT'
    });
  });
});

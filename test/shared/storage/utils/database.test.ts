/**
 * @file database.test.ts
 * @description 验证渲染进程数据库初始化竞态错误识别。
 */
import { describe, expect, it } from 'vitest';
import { isDatabaseInitializationRaceError } from '@/shared/storage/utils/database';

describe('isDatabaseInitializationRaceError', () => {
  it('recognizes database initialization errors from plain IPC-like objects', (): void => {
    expect(
      isDatabaseInitializationRaceError({
        message: "Error invoking remote method 'chat:message:list': Error: Database not initialized"
      })
    ).toBe(true);
  });

  it('recognizes database initialization errors from strings', (): void => {
    expect(isDatabaseInitializationRaceError('Database not initialized')).toBe(true);
  });
});

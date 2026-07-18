/**
 * @file directory-install.test.ts
 * @description 通用目录安装阶段事件的持久化日志适配测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDirectoryInstallLogger } from '@/shared/logger/directoryInstall';

/** 持久化 Logger 测试替身。 */
const loggerMock = vi.hoisted(() => ({
  error: vi.fn<(message: string) => Promise<void>>(),
  info: vi.fn<(message: string) => Promise<void>>(),
  warn: vi.fn<(message: string) => Promise<void>>()
}));

vi.mock('@/shared/logger', () => ({
  logger: loggerMock
}));

describe('createDirectoryInstallLogger', (): void => {
  beforeEach((): void => {
    loggerMock.error.mockReset().mockResolvedValue(undefined);
    loggerMock.info.mockReset().mockResolvedValue(undefined);
    loggerMock.warn.mockReset().mockResolvedValue(undefined);
  });

  it('records stage, retry and final failure with a shared resource prefix', async (): Promise<void> => {
    const installLogger = createDirectoryInstallLogger('widget', 'weather');

    await installLogger.start();
    await installLogger.onEvent({ type: 'stage', stage: 'activate' });
    await installLogger.onEvent({ type: 'rename-retry', stage: 'activate', attempt: 1, error: new Error('EPERM') });
    await installLogger.failure(new Error('EPERM: operation not permitted'));

    expect(loggerMock.info).toHaveBeenCalledWith('[widget-install] start resource=weather');
    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('rename-retry resource=weather stage=activate attempt=1 error=EPERM'));
    expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('failed resource=weather stage=activate error=EPERM: operation not permitted'));
  });

  it('maps cleanup and rollback events to warning or error logs', async (): Promise<void> => {
    const installLogger = createDirectoryInstallLogger('skill', 'demo');

    await installLogger.onEvent({ type: 'cleanup-failed', target: 'backup', error: new Error('cleanup failed') });
    await installLogger.onEvent({ type: 'rollback-failed', error: new Error('rollback failed') });
    await installLogger.onEvent({ type: 'rollback-completed' });
    await installLogger.success();

    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('cleanup-failed resource=demo target=backup error=cleanup failed'));
    expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('rollback-failed resource=demo error=rollback failed'));
    expect(loggerMock.warn).toHaveBeenCalledWith('[skill-install] rollback-completed resource=demo');
    expect(loggerMock.info).toHaveBeenCalledWith('[skill-install] success resource=demo');
  });
});

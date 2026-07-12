/**
 * @file install-lock.test.ts
 * @description 跨渲染窗口目录安装锁测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { DirectoryInstallLockManager, normalizeDirectoryInstallLockKey } from '../../../../../electron/main/modules/file/install-lock.mts';

describe('DirectoryInstallLockManager', (): void => {
  it('serializes equivalent Windows target paths across renderer owners', async (): Promise<void> => {
    const manager = new DirectoryInstallLockManager('win32');
    const firstToken = await manager.acquire('C:\\Users\\Test\\.agents\\skills\\demo', 1);
    const secondGranted = vi.fn();
    const secondPromise = manager.acquire('c:/users/test/.agents/skills/demo', 2).then((token: string): string => {
      secondGranted(token);
      return token;
    });

    await Promise.resolve();
    expect(secondGranted).not.toHaveBeenCalled();

    manager.release(firstToken, 1);
    const secondToken = await secondPromise;

    expect(secondGranted).toHaveBeenCalledWith(secondToken);
    manager.release(secondToken, 2);
  });

  it('does not block installations for different targets', async (): Promise<void> => {
    const manager = new DirectoryInstallLockManager();

    const [firstToken, secondToken] = await Promise.all([manager.acquire('/skills/one', 1), manager.acquire('/skills/two', 2)]);

    expect(firstToken).not.toBe(secondToken);
    manager.release(firstToken, 1);
    manager.release(secondToken, 2);
  });

  it('releases an active lock when its renderer is destroyed', async (): Promise<void> => {
    const manager = new DirectoryInstallLockManager();
    await manager.acquire('/skills/demo', 1);
    const waitingTokenPromise = manager.acquire('/skills/demo', 2);

    manager.releaseOwner(1);

    const waitingToken = await waitingTokenPromise;
    expect(waitingToken).toEqual(expect.any(String));
    manager.release(waitingToken, 2);
  });
});

describe('normalizeDirectoryInstallLockKey', (): void => {
  it('normalizes Windows separators and casing', (): void => {
    expect(normalizeDirectoryInstallLockKey('C:\\Users\\Test\\Skill', 'win32')).toBe(normalizeDirectoryInstallLockKey('c:/users/test/skill', 'win32'));
  });
});

/**
 * @file watch.test.ts
 * @description Workspace 目录监听匹配规则测试。
 */
import { EventEmitter } from 'node:events';
import chokidar from 'chokidar';
import { describe, expect, it, type Mock, vi } from 'vitest';
import { FileWatchService, isResourceDirectory } from '../../../../../electron/main/modules/workspace/watch.mts';

/** 测试用 Chokidar watcher。 */
interface TestWatcher extends EventEmitter {
  /** 关闭 watcher。 */
  close: Mock<() => Promise<void>>;
}

describe('isResourceDirectory', (): void => {
  it('matches only direct visible child directories', (): void => {
    const rootPath = '/Users/test/.agents/skills';

    expect(isResourceDirectory('/Users/test/.agents/skills/weather', rootPath)).toBe(true);
    expect(isResourceDirectory('C:\\Users\\test\\.agents\\skills\\weather', 'C:\\Users\\test\\.agents\\skills')).toBe(true);
    expect(isResourceDirectory('/Users/test/.agents/skills/.draft', rootPath)).toBe(false);
    expect(isResourceDirectory('/Users/test/.agents/skills/group/weather', rootPath)).toBe(false);
    expect(isResourceDirectory('/Users/test/.agents/other/weather', rootPath)).toBe(false);
  });
});

describe('FileWatchService resource directory watcher', (): void => {
  it('waits for Chokidar readiness before completing registration', async (): Promise<void> => {
    const watcher = Object.assign(new EventEmitter(), {
      close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    }) satisfies TestWatcher;
    const watchSpy = vi.spyOn(chokidar, 'watch').mockReturnValue(watcher as unknown as ReturnType<typeof chokidar.watch>);
    const service = new FileWatchService();
    let registered = false;

    const registration = service.watchResourceDirectory('/Users/test/.agents/skills').then((): void => {
      registered = true;
    });
    await Promise.resolve();

    expect(registered).toBe(false);
    watcher.emit('ready');
    await registration;
    expect(registered).toBe(true);

    await service.unwatchAll();
    watchSpy.mockRestore();
  });

  it('keeps an error listener after resource watcher readiness', async (): Promise<void> => {
    const watcher = Object.assign(new EventEmitter(), {
      close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    }) satisfies TestWatcher;
    const watchSpy = vi.spyOn(chokidar, 'watch').mockReturnValue(watcher as unknown as ReturnType<typeof chokidar.watch>);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((): void => undefined);
    const service = new FileWatchService();

    const registration = service.watchResourceDirectory('/Users/test/.agents/skills');
    watcher.emit('ready');
    await registration;

    expect(watcher.listenerCount('error')).toBeGreaterThan(0);
    expect((): boolean => watcher.emit('error', new Error('runtime watcher failure'))).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith('ResourceDirectoryWatchService error:', expect.any(Error));

    await service.unwatchAll();
    errorSpy.mockRestore();
    watchSpy.mockRestore();
  });
});

/**
 * @file directory.test.ts
 * @description 通用目录安装事务的写入、冲突、重试、回滚与清理测试。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DirectoryInstallConflictError,
  installDirectory,
  recoverDirectoryInstallTransactions,
  type DirectoryInstallRecoveryAPI,
  type DirectoryInstallerAPI
} from '@/utils/file/directory';

/** 通用目录安装 API 测试替身。 */
interface DirectoryInstallerAPIMock extends DirectoryInstallerAPI {
  acquireDirectoryInstallLock: ReturnType<typeof vi.fn<DirectoryInstallerAPI['acquireDirectoryInstallLock']>>;
  ensureDir: ReturnType<typeof vi.fn<DirectoryInstallerAPI['ensureDir']>>;
  getPathStatus: ReturnType<typeof vi.fn<DirectoryInstallerAPI['getPathStatus']>>;
  renameFile: ReturnType<typeof vi.fn<DirectoryInstallerAPI['renameFile']>>;
  releaseDirectoryInstallLock: ReturnType<typeof vi.fn<DirectoryInstallerAPI['releaseDirectoryInstallLock']>>;
  saveBinaryFile: ReturnType<typeof vi.fn<DirectoryInstallerAPI['saveBinaryFile']>>;
  trashFile: ReturnType<typeof vi.fn<DirectoryInstallerAPI['trashFile']>>;
  writeFile: ReturnType<typeof vi.fn<DirectoryInstallerAPI['writeFile']>>;
}

/** 安装事务恢复 API 测试替身。 */
interface DirectoryInstallRecoveryAPIMock extends DirectoryInstallRecoveryAPI {
  acquireDirectoryInstallLock: ReturnType<typeof vi.fn<DirectoryInstallRecoveryAPI['acquireDirectoryInstallLock']>>;
  getPathStatus: ReturnType<typeof vi.fn<DirectoryInstallRecoveryAPI['getPathStatus']>>;
  readFile: ReturnType<typeof vi.fn<DirectoryInstallRecoveryAPI['readFile']>>;
  readWorkspaceDirectory: ReturnType<typeof vi.fn<DirectoryInstallRecoveryAPI['readWorkspaceDirectory']>>;
  renameFile: ReturnType<typeof vi.fn<DirectoryInstallRecoveryAPI['renameFile']>>;
  releaseDirectoryInstallLock: ReturnType<typeof vi.fn<DirectoryInstallRecoveryAPI['releaseDirectoryInstallLock']>>;
  trashFile: ReturnType<typeof vi.fn<DirectoryInstallRecoveryAPI['trashFile']>>;
}

/**
 * 创建默认目录安装 API 测试替身。
 * @returns 所有文件操作默认成功的测试替身
 */
function createInstallerAPI(): DirectoryInstallerAPIMock {
  return {
    acquireDirectoryInstallLock: vi.fn<DirectoryInstallerAPI['acquireDirectoryInstallLock']>().mockResolvedValue('install-lock'),
    ensureDir: vi.fn<DirectoryInstallerAPI['ensureDir']>().mockResolvedValue(undefined),
    getPathStatus: vi.fn<DirectoryInstallerAPI['getPathStatus']>().mockResolvedValue({ exists: false, isFile: false, isDirectory: false }),
    renameFile: vi.fn<DirectoryInstallerAPI['renameFile']>().mockResolvedValue(undefined),
    releaseDirectoryInstallLock: vi.fn<DirectoryInstallerAPI['releaseDirectoryInstallLock']>().mockResolvedValue(undefined),
    saveBinaryFile: vi.fn<DirectoryInstallerAPI['saveBinaryFile']>().mockResolvedValue(null),
    trashFile: vi.fn<DirectoryInstallerAPI['trashFile']>().mockResolvedValue(undefined),
    writeFile: vi.fn<DirectoryInstallerAPI['writeFile']>().mockResolvedValue(undefined)
  };
}

/**
 * 创建确定性的临时目录名称。
 * @param kind - 临时或备份目录种类
 * @returns 固定测试目录名
 */
function createScratchName(kind: 'temporary' | 'backup'): string {
  return kind === 'temporary' ? '.tmp-test' : '.bak-test';
}

/**
 * 创建默认事务恢复 API 测试替身。
 * @returns 所有恢复操作默认成功的测试替身
 */
function createRecoveryAPI(): DirectoryInstallRecoveryAPIMock {
  return {
    acquireDirectoryInstallLock: vi.fn<DirectoryInstallRecoveryAPI['acquireDirectoryInstallLock']>().mockResolvedValue('recovery-lock'),
    getPathStatus: vi.fn<DirectoryInstallRecoveryAPI['getPathStatus']>().mockResolvedValue({ exists: false, isFile: false, isDirectory: false }),
    readFile: vi.fn<DirectoryInstallRecoveryAPI['readFile']>(),
    readWorkspaceDirectory: vi.fn<DirectoryInstallRecoveryAPI['readWorkspaceDirectory']>(),
    renameFile: vi.fn<DirectoryInstallRecoveryAPI['renameFile']>().mockResolvedValue(undefined),
    releaseDirectoryInstallLock: vi.fn<DirectoryInstallRecoveryAPI['releaseDirectoryInstallLock']>().mockResolvedValue(undefined),
    trashFile: vi.fn<DirectoryInstallRecoveryAPI['trashFile']>().mockResolvedValue(undefined)
  };
}

describe('installDirectory', (): void => {
  beforeEach((): void => {
    vi.useRealTimers();
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('writes text and binary files into a temporary directory before activation', async (): Promise<void> => {
    const api = createInstallerAPI();
    const binary = new Uint8Array([1, 2, 3]).buffer;

    await installDirectory({
      api,
      targetDir: 'C:\\Users\\test\\.agents\\skills\\demo',
      conflictStrategy: 'replace',
      files: [
        { kind: 'text', relativePath: 'SKILL.md', content: '# Demo' },
        { kind: 'binary', relativePath: 'assets/icon.bin', content: binary }
      ],
      scratchNameFactory: createScratchName
    });

    expect(api.ensureDir).toHaveBeenCalledWith('C:/Users/test/.agents/skills/.tmp-test');
    expect(api.ensureDir).toHaveBeenCalledWith('C:/Users/test/.agents/skills/.tmp-test/assets');
    expect(api.writeFile).toHaveBeenCalledWith('C:/Users/test/.agents/skills/.tmp-test/SKILL.md', '# Demo');
    expect(api.saveBinaryFile).toHaveBeenCalledWith(binary, 'C:/Users/test/.agents/skills/.tmp-test/assets/icon.bin');
    expect(api.renameFile).toHaveBeenLastCalledWith('C:/Users/test/.agents/skills/.tmp-test', 'C:/Users/test/.agents/skills/demo');
    expect(api.acquireDirectoryInstallLock).toHaveBeenCalledWith('C:/Users/test/.agents/skills/demo');
    expect(api.releaseDirectoryInstallLock).toHaveBeenCalledWith('install-lock');
  });

  it.each(['../outside.txt', 'assets/../../outside.txt', '/absolute.txt', 'C:\\outside.txt'])(
    'rejects unsafe relative file path %s before creating a transaction',
    async (relativePath: string): Promise<void> => {
      const api = createInstallerAPI();

      await expect(
        installDirectory({
          api,
          targetDir: '/Users/test/.agents/skills/demo',
          conflictStrategy: 'replace',
          files: [{ kind: 'text', relativePath, content: 'unsafe' }],
          scratchNameFactory: createScratchName
        })
      ).rejects.toThrow('安装文件路径不安全');

      expect(api.ensureDir).not.toHaveBeenCalled();
      expect(api.writeFile).not.toHaveBeenCalled();
    }
  );

  it('writes a recovery transaction before replacing an existing target and removes it after success', async (): Promise<void> => {
    const api = createInstallerAPI();
    api.getPathStatus.mockResolvedValue({ exists: true, isFile: false, isDirectory: true });

    await installDirectory({
      api,
      targetDir: '/Users/test/.agents/skills/demo',
      conflictStrategy: 'replace',
      files: [{ kind: 'text', relativePath: 'SKILL.md', content: '# Demo' }],
      scratchNameFactory: createScratchName,
      transactionNameFactory: (): string => '.install-test.json'
    });

    expect(api.writeFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.install-test.json', expect.stringContaining('"targetName":"demo"'));
    const transactionCallIndex = api.writeFile.mock.calls.findIndex(([path]: [string, string]): boolean => path.endsWith('/.install-test.json'));
    expect(api.writeFile.mock.invocationCallOrder[transactionCallIndex] ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      api.renameFile.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.install-test.json');
  });

  it('rejects an existing target without writing or deleting it', async (): Promise<void> => {
    const api = createInstallerAPI();
    api.getPathStatus.mockResolvedValue({ exists: true, isFile: false, isDirectory: true });

    await expect(
      installDirectory({
        api,
        targetDir: '/Users/test/.tibis/widgets/weather',
        conflictStrategy: 'reject',
        files: [{ kind: 'text', relativePath: 'widget.json', content: '{}' }],
        scratchNameFactory: createScratchName
      })
    ).rejects.toBeInstanceOf(DirectoryInstallConflictError);

    expect(api.ensureDir).not.toHaveBeenCalled();
    expect(api.writeFile).not.toHaveBeenCalled();
    expect(api.renameFile).not.toHaveBeenCalled();
    expect(api.trashFile).not.toHaveBeenCalled();
  });

  it('rechecks a rejected target before activation to prevent concurrent replacement', async (): Promise<void> => {
    const api = createInstallerAPI();
    api.getPathStatus
      .mockResolvedValueOnce({ exists: false, isFile: false, isDirectory: false })
      .mockResolvedValueOnce({ exists: true, isFile: false, isDirectory: true });

    await expect(
      installDirectory({
        api,
        targetDir: '/Users/test/.tibis/widgets/weather',
        conflictStrategy: 'reject',
        files: [{ kind: 'text', relativePath: 'widget.json', content: '{}' }],
        scratchNameFactory: createScratchName
      })
    ).rejects.toBeInstanceOf(DirectoryInstallConflictError);

    expect(api.renameFile).not.toHaveBeenCalled();
    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.tibis/widgets/.tmp-test');
  });

  it('backs up and replaces an existing target when configured to replace', async (): Promise<void> => {
    const api = createInstallerAPI();
    api.getPathStatus.mockResolvedValue({ exists: true, isFile: false, isDirectory: true });

    await installDirectory({
      api,
      targetDir: '/Users/test/.agents/skills/demo',
      conflictStrategy: 'replace',
      files: [{ kind: 'text', relativePath: 'SKILL.md', content: '# Demo' }],
      scratchNameFactory: createScratchName
    });

    expect(api.renameFile.mock.calls).toEqual([
      ['/Users/test/.agents/skills/demo', '/Users/test/.agents/skills/.bak-test'],
      ['/Users/test/.agents/skills/.tmp-test', '/Users/test/.agents/skills/demo']
    ]);
    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.bak-test');
  });

  it('retries transient Windows rename failures before activation succeeds', async (): Promise<void> => {
    vi.useFakeTimers();
    const api = createInstallerAPI();
    api.renameFile.mockRejectedValueOnce(new Error('EPERM: operation not permitted')).mockResolvedValueOnce(undefined);
    const onEvent = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const installPromise = installDirectory({
      api,
      targetDir: 'C:/Users/test/.agents/skills/demo',
      conflictStrategy: 'replace',
      files: [{ kind: 'text', relativePath: 'SKILL.md', content: '# Demo' }],
      scratchNameFactory: createScratchName,
      retryDelayMs: 10,
      onEvent
    });
    await vi.advanceTimersByTimeAsync(10);
    await installPromise;

    expect(api.renameFile).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'rename-retry', stage: 'activate', attempt: 1 }));
  });

  it('restores the backup and cleans the temporary directory when activation fails', async (): Promise<void> => {
    const api = createInstallerAPI();
    const activationError = new Error('ENOENT: temporary directory missing');
    api.getPathStatus.mockResolvedValue({ exists: true, isFile: false, isDirectory: true });
    api.renameFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(activationError).mockResolvedValueOnce(undefined);

    await expect(
      installDirectory({
        api,
        targetDir: '/Users/test/.agents/skills/demo',
        conflictStrategy: 'replace',
        files: [{ kind: 'text', relativePath: 'SKILL.md', content: '# Demo' }],
        scratchNameFactory: createScratchName
      })
    ).rejects.toBe(activationError);

    expect(api.renameFile).toHaveBeenLastCalledWith('/Users/test/.agents/skills/.bak-test', '/Users/test/.agents/skills/demo');
    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.tmp-test');
  });

  it('cleans the temporary directory when writing a file fails', async (): Promise<void> => {
    const api = createInstallerAPI();
    const writeError = new Error('EACCES: permission denied');
    api.writeFile.mockImplementation(async (path: string): Promise<void> => {
      if (path.endsWith('/widget.json')) {
        throw writeError;
      }
    });

    await expect(
      installDirectory({
        api,
        targetDir: '/Users/test/.tibis/widgets/weather',
        conflictStrategy: 'reject',
        files: [{ kind: 'text', relativePath: 'widget.json', content: '{}' }],
        scratchNameFactory: createScratchName
      })
    ).rejects.toBe(writeError);

    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.tibis/widgets/.tmp-test');
  });

  it('keeps the transaction when temporary cleanup fails so recovery can retry', async (): Promise<void> => {
    const api = createInstallerAPI();
    const activationError = new Error('EACCES: activation failed');
    api.renameFile.mockRejectedValue(activationError);
    api.trashFile.mockImplementation(async (path: string): Promise<void> => {
      if (path.endsWith('/.tmp-test')) {
        throw new Error('EBUSY: temporary directory is locked');
      }
    });

    await expect(
      installDirectory({
        api,
        targetDir: '/Users/test/.tibis/widgets/weather',
        conflictStrategy: 'reject',
        files: [{ kind: 'text', relativePath: 'widget.json', content: '{}' }],
        scratchNameFactory: createScratchName,
        transactionNameFactory: (): string => '.install-test.json'
      })
    ).rejects.toBe(activationError);

    expect(api.trashFile).not.toHaveBeenCalledWith('/Users/test/.tibis/widgets/.install-test.json');
    expect(api.releaseDirectoryInstallLock).toHaveBeenCalledWith('install-lock');
  });
});

describe('recoverDirectoryInstallTransactions', (): void => {
  it('reports recovery failures without interrupting the scan', async (): Promise<void> => {
    const api = createRecoveryAPI();
    const onFailure = vi.fn();
    const recoveryError = new Error('EACCES: restore failed');
    api.readWorkspaceDirectory.mockResolvedValue({ entries: [{ name: '.install-test.json', type: 'file' }] });
    api.readFile.mockResolvedValue({
      content: JSON.stringify({ version: 1, targetName: 'demo', temporaryName: '.tmp-test', backupName: '.bak-test' })
    });
    api.getPathStatus.mockImplementation(async (path: string) => ({
      exists: path.endsWith('/.bak-test'),
      isFile: false,
      isDirectory: path.endsWith('/.bak-test')
    }));
    api.renameFile.mockRejectedValue(recoveryError);

    await recoverDirectoryInstallTransactions('/Users/test/.agents/skills', api, onFailure);

    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ transactionPath: '/Users/test/.agents/skills/.install-test.json', error: recoveryError }));
  });

  it('holds the shared target lock while recovering a transaction', async (): Promise<void> => {
    const api = createRecoveryAPI();
    api.acquireDirectoryInstallLock.mockResolvedValue('lock-token');
    api.readWorkspaceDirectory.mockResolvedValue({ entries: [{ name: '.install-test.json', type: 'file' }] });
    api.readFile.mockResolvedValue({
      content: JSON.stringify({ version: 1, targetName: 'demo', temporaryName: '.tmp-test', backupName: '.bak-test' })
    });

    await recoverDirectoryInstallTransactions('/Users/test/.agents/skills', api);

    expect(api.acquireDirectoryInstallLock).toHaveBeenCalledWith('/Users/test/.agents/skills/demo');
    expect(api.releaseDirectoryInstallLock).toHaveBeenCalledWith('lock-token');
    expect(api.readFile).toHaveBeenCalledTimes(2);
  });

  it('restores a backup when a crash left the target missing', async (): Promise<void> => {
    const api = createRecoveryAPI();
    api.readWorkspaceDirectory.mockResolvedValue({ entries: [{ name: '.install-test.json', type: 'file' }] });
    api.readFile.mockResolvedValue({
      content: JSON.stringify({ version: 1, targetName: 'demo', temporaryName: '.tmp-test', backupName: '.bak-test' })
    });
    api.getPathStatus.mockImplementation(async (path: string) => ({
      exists: path.endsWith('/.bak-test') || path.endsWith('/.tmp-test'),
      isFile: false,
      isDirectory: path.endsWith('/.bak-test') || path.endsWith('/.tmp-test')
    }));

    await recoverDirectoryInstallTransactions('/Users/test/.agents/skills', api);

    expect(api.renameFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.bak-test', '/Users/test/.agents/skills/demo');
    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.tmp-test');
    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.install-test.json');
  });

  it('keeps the activated target and cleans its stale backup after a crash', async (): Promise<void> => {
    const api = createRecoveryAPI();
    api.readWorkspaceDirectory.mockResolvedValue({ entries: [{ name: '.install-test.json', type: 'file' }] });
    api.readFile.mockResolvedValue({
      content: JSON.stringify({ version: 1, targetName: 'demo', temporaryName: '.tmp-test', backupName: '.bak-test' })
    });
    api.getPathStatus.mockResolvedValue({ exists: true, isFile: false, isDirectory: true });

    await recoverDirectoryInstallTransactions('/Users/test/.agents/skills', api);

    expect(api.renameFile).not.toHaveBeenCalled();
    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.bak-test');
    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.tmp-test');
    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.install-test.json');
  });

  it('ignores a forged transaction that points outside the install root', async (): Promise<void> => {
    const api = createRecoveryAPI();
    api.readWorkspaceDirectory.mockResolvedValue({ entries: [{ name: '.install-test.json', type: 'file' }] });
    api.readFile.mockResolvedValue({
      content: JSON.stringify({ version: 1, targetName: '../outside', temporaryName: '.tmp-test', backupName: '.bak-test' })
    });

    await recoverDirectoryInstallTransactions('/Users/test/.agents/skills', api);

    expect(api.getPathStatus).not.toHaveBeenCalled();
    expect(api.renameFile).not.toHaveBeenCalled();
    expect(api.trashFile).not.toHaveBeenCalled();
  });
});

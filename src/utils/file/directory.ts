/**
 * @file directory.ts
 * @description 通用目录安装事务，统一文件写入、冲突策略、重命名重试、回滚与清理。
 */
import { nanoid } from 'nanoid';
import { path } from '@/utils/file/path';
import { posix } from '@/utils/file/posix';

/** 目录安装冲突策略。 */
export type DirectoryInstallConflictStrategy = 'replace' | 'reject';

/** 目录安装重命名阶段。 */
export type DirectoryInstallRenameStage = 'backup' | 'activate' | 'rollback';

/** 目录安装文件。 */
export type DirectoryInstallFile = { kind: 'text'; relativePath: string; content: string } | { kind: 'binary'; relativePath: string; content: ArrayBuffer };

/** 目录路径状态。 */
export interface DirectoryInstallPathStatus {
  /** 路径是否存在。 */
  exists: boolean;
  /** 路径是否为普通文件。 */
  isFile: boolean;
  /** 路径是否为目录。 */
  isDirectory: boolean;
}

/** 目录安装文件系统依赖。 */
export interface DirectoryInstallerAPI {
  /** 在共享宿主中获取目标目录安装锁。 */
  acquireDirectoryInstallLock: (targetDir: string) => Promise<string>;
  /** 确保目录存在。 */
  ensureDir: (path: string) => Promise<void>;
  /** 获取路径状态。 */
  getPathStatus: (path: string) => Promise<DirectoryInstallPathStatus>;
  /** 重命名文件或目录。 */
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
  /** 释放共享宿主中的目标目录安装锁。 */
  releaseDirectoryInstallLock: (token: string) => Promise<void>;
  /** 保存二进制文件。 */
  saveBinaryFile: (content: ArrayBuffer, path?: string) => Promise<string | null>;
  /** 移动文件或目录到回收站。 */
  trashFile: (path: string) => Promise<void>;
  /** 写入文本文件。 */
  writeFile: (path: string, content: string) => Promise<void>;
}

/** 目录安装事务恢复依赖。 */
export interface DirectoryInstallRecoveryAPI {
  /** 获取目标目录跨窗口安装锁。 */
  acquireDirectoryInstallLock: DirectoryInstallerAPI['acquireDirectoryInstallLock'];
  /** 获取路径状态。 */
  getPathStatus: DirectoryInstallerAPI['getPathStatus'];
  /** 读取事务记录。 */
  readFile: (path: string) => Promise<{ content: string }>;
  /** 读取安装根目录的直接子项。 */
  readWorkspaceDirectory: (options: { directoryPath: string }) => Promise<{ entries: Array<{ name: string; type: 'file' | 'directory' }> }>;
  /** 恢复备份目录。 */
  renameFile: DirectoryInstallerAPI['renameFile'];
  /** 释放目标目录跨窗口安装锁。 */
  releaseDirectoryInstallLock: DirectoryInstallerAPI['releaseDirectoryInstallLock'];
  /** 清理已确认无用的事务文件或中间目录。 */
  trashFile: DirectoryInstallerAPI['trashFile'];
}

/** 持久化目录安装事务记录。 */
interface DirectoryInstallTransactionRecord {
  /** 记录格式版本。 */
  version: 1;
  /** 目标目录在安装根目录下的名称。 */
  targetName: string;
  /** 临时目录在安装根目录下的名称。 */
  temporaryName: string;
  /** 备份目录在安装根目录下的名称。 */
  backupName: string;
}

/** 目录安装事务恢复失败信息。 */
export interface DirectoryInstallRecoveryFailure {
  /** 恢复失败的事务文件或安装根目录。 */
  transactionPath: string;
  /** 原始恢复错误。 */
  error: unknown;
}

/** 目录安装事务恢复失败回调。 */
export type DirectoryInstallRecoveryFailureHandler = (failure: DirectoryInstallRecoveryFailure) => void | Promise<void>;

/** 目录安装阶段事件。 */
export type DirectoryInstallEvent =
  | { type: 'stage'; stage: 'check-target' | 'write-files' | 'backup' | 'activate' | 'cleanup' | 'rollback' }
  | { type: 'rename-retry'; stage: DirectoryInstallRenameStage; attempt: number; error: unknown }
  | { type: 'cleanup-failed'; target: 'temporary' | 'backup' | 'transaction'; error: unknown }
  | { type: 'rollback-failed'; error: unknown }
  | { type: 'rollback-completed' };

/** 目录安装配置。 */
export interface DirectoryInstallerOptions {
  /** 文件系统依赖。 */
  api: DirectoryInstallerAPI;
  /** 最终目标目录。 */
  targetDir: string;
  /** 目标目录冲突策略。 */
  conflictStrategy: DirectoryInstallConflictStrategy;
  /** 待安装文件。 */
  files: DirectoryInstallFile[];
  /** 测试或调用方自定义临时目录名称。 */
  scratchNameFactory?: (kind: 'temporary' | 'backup') => string;
  /** 测试或调用方自定义事务记录名称。 */
  transactionNameFactory?: () => string;
  /** 安装阶段事件回调。 */
  onEvent?: (event: DirectoryInstallEvent) => void | Promise<void>;
  /** 最大重命名执行次数，包含首次执行。 */
  maxRenameAttempts?: number;
  /** 重命名重试间隔（毫秒）。 */
  retryDelayMs?: number;
}

/** 默认重命名最大执行次数。 */
const DEFAULT_MAX_RENAME_ATTEMPTS = 3;
/** 默认重命名重试间隔（毫秒）。 */
const DEFAULT_RETRY_DELAY_MS = 80;
/** Windows 常见瞬时文件占用错误码。 */
const TRANSIENT_RENAME_ERROR_PATTERN = /\b(?:EPERM|EACCES|EBUSY)\b/iu;
/** 安装事务记录文件名前缀。 */
const TRANSACTION_FILE_PATTERN = /^\.install-[A-Za-z0-9_-]+\.json$/u;

/**
 * 目标目录已经存在且策略禁止覆盖时抛出的错误。
 */
export class DirectoryInstallConflictError extends Error {
  /**
   * 创建目录安装冲突错误。
   * @param targetDir - 已存在的目标目录
   */
  constructor(targetDir: string) {
    super(`目标目录已存在：${targetDir}`);
    this.name = 'DirectoryInstallConflictError';
  }
}

/**
 * 将未知目录安装错误转换为可展示文本。
 * @param error - 原始错误
 * @returns 错误摘要
 */
export function formatDirectoryInstallError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 读取规范化路径的父目录。
 * @param path - 文件或目录路径
 * @returns 父目录路径
 */
function readParentPath(filePath: string): string {
  return posix.dirname(filePath);
}

/**
 * 读取路径最后一个片段。
 * @param path - 文件或目录路径
 * @returns 最后一个非空路径片段
 */
function readBaseName(filePath: string): string {
  return posix.basename(filePath);
}

/**
 * 校验并规范化安装文件相对路径。
 * @param relativePath - 调用方提供的相对路径
 * @returns 使用 `/` 分隔的安全相对路径
 */
export function normalizeDirectoryInstallRelativePath(relativePath: string): string {
  return path.validatePath(relativePath, '安装文件路径');
}

/**
 * 读取相对文件路径的父目录片段。
 * @param relativePath - 相对路径
 * @returns 父目录片段，无父目录时返回空字符串
 */
function readRelativeParentPath(relativePath: string): string {
  const normalized = posix.slashify(relativePath).replace(/^\/+|\/+$/gu, '');
  const index = normalized.lastIndexOf('/');
  return index > -1 ? normalized.slice(0, index) : '';
}

/**
 * 安全触发安装事件，日志或观察者失败不能中断文件事务。
 * @param callback - 安装事件回调
 * @param event - 安装事件
 * @returns 事件处理完成信号
 */
async function emitInstallEvent(callback: DirectoryInstallerOptions['onEvent'], event: DirectoryInstallEvent): Promise<void> {
  try {
    await callback?.(event);
  } catch {
    // 观察者失败不能改变安装事务结果。
  }
}

/**
 * 安全报告事务恢复失败，观察者异常不能阻断资源扫描。
 * @param callback - 恢复失败回调
 * @param failure - 恢复失败信息
 * @returns 回调完成信号
 */
async function emitRecoveryFailure(callback: DirectoryInstallRecoveryFailureHandler | undefined, failure: DirectoryInstallRecoveryFailure): Promise<void> {
  try {
    await callback?.(failure);
  } catch {
    // 恢复日志失败不能覆盖原始恢复错误或阻断扫描。
  }
}

/**
 * 等待指定时长。
 * @param delayMs - 等待毫秒数
 * @returns 等待完成信号
 */
function wait(delayMs: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * 判断重命名错误是否适合短暂等待后重试。
 * @param error - 原始错误
 * @returns 是否为 Windows 常见瞬时错误
 */
function isTransientRenameError(error: unknown): boolean {
  return TRANSIENT_RENAME_ERROR_PATTERN.test(formatDirectoryInstallError(error));
}

/**
 * 执行一次重命名，瞬时失败时递归执行下一次有限尝试。
 * @param options - 安装配置
 * @param oldPath - 原始目录
 * @param newPath - 目标目录
 * @param stage - 重命名阶段
 * @param attempt - 当前执行次数
 * @param maxAttempts - 最大执行次数
 * @param delayMs - 重试间隔
 * @returns 重命名完成信号
 */
async function attemptRename(
  options: DirectoryInstallerOptions,
  oldPath: string,
  newPath: string,
  stage: DirectoryInstallRenameStage,
  attempt: number,
  maxAttempts: number,
  delayMs: number
): Promise<void> {
  try {
    await options.api.renameFile(oldPath, newPath);
  } catch (error: unknown) {
    if (!isTransientRenameError(error) || attempt === maxAttempts) {
      throw error;
    }

    await emitInstallEvent(options.onEvent, { type: 'rename-retry', stage, attempt, error });
    await wait(delayMs);
    await attemptRename(options, oldPath, newPath, stage, attempt + 1, maxAttempts, delayMs);
  }
}

/**
 * 使用统一重试配置重命名目录。
 * @param options - 安装配置
 * @param oldPath - 原始目录
 * @param newPath - 目标目录
 * @param stage - 重命名阶段
 * @returns 重命名完成信号
 */
function renameDirectory(options: DirectoryInstallerOptions, oldPath: string, newPath: string, stage: DirectoryInstallRenameStage): Promise<void> {
  const maxAttempts = Math.max(1, options.maxRenameAttempts ?? DEFAULT_MAX_RENAME_ATTEMPTS);
  const delayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  return attemptRename(options, oldPath, newPath, stage, 1, maxAttempts, delayMs);
}

/**
 * 写入单个安装文件。
 * @param options - 安装配置
 * @param temporaryDir - 临时目录
 * @param file - 待写入文件
 * @returns 写入完成信号
 */
async function writeInstallFile(options: DirectoryInstallerOptions, temporaryDir: string, file: DirectoryInstallFile): Promise<void> {
  const normalizedRelativePath = normalizeDirectoryInstallRelativePath(file.relativePath);
  const parentPath = readRelativeParentPath(normalizedRelativePath);
  const filePath = posix.join(temporaryDir, normalizedRelativePath);

  if (parentPath) {
    await options.api.ensureDir(posix.join(temporaryDir, parentPath));
  }

  if (file.kind === 'text') {
    await options.api.writeFile(filePath, file.content);
    return;
  }

  await options.api.saveBinaryFile(file.content, filePath);
}

/**
 * 安全清理安装中间目录。
 * @param options - 安装配置
 * @param path - 待清理目录
 * @param target - 临时或备份目录标记
 * @returns 清理完成信号
 */
async function cleanupDirectory(options: DirectoryInstallerOptions, filePath: string, target: 'temporary' | 'backup' | 'transaction'): Promise<boolean> {
  try {
    await options.api.trashFile(filePath);
    return true;
  } catch (error: unknown) {
    await emitInstallEvent(options.onEvent, { type: 'cleanup-failed', target, error });
    return false;
  }
}

/**
 * 解析并校验安装事务记录，避免伪造记录越过安装根目录。
 * @param content - 事务记录文本
 * @returns 安全事务记录，格式无效时返回 null
 */
function parseTransactionRecord(content: string): DirectoryInstallTransactionRecord | null {
  try {
    const value = JSON.parse(content) as Partial<DirectoryInstallTransactionRecord>;
    if (
      value.version !== 1 ||
      typeof value.targetName !== 'string' ||
      typeof value.temporaryName !== 'string' ||
      typeof value.backupName !== 'string' ||
      !path.isValidSegment(value.targetName) ||
      !/^\.tmp-[A-Za-z0-9_-]+$/u.test(value.temporaryName) ||
      !/^\.bak-[A-Za-z0-9_-]+$/u.test(value.backupName)
    ) {
      return null;
    }

    return value as DirectoryInstallTransactionRecord;
  } catch {
    return null;
  }
}

/**
 * 恢复单个被进程崩溃打断的目录安装事务。
 * @param parentDir - 安装根目录
 * @param transactionName - 事务记录文件名
 * @param api - 恢复依赖
 */
async function recoverTransaction(
  parentDir: string,
  transactionName: string,
  api: DirectoryInstallRecoveryAPI,
  onFailure: DirectoryInstallRecoveryFailureHandler | undefined
): Promise<void> {
  const transactionPath = posix.join(parentDir, transactionName);
  let lockToken: string | null = null;

  try {
    const initialRecord = parseTransactionRecord((await api.readFile(transactionPath)).content);
    if (!initialRecord) {
      return;
    }

    const initialTargetDir = posix.join(parentDir, initialRecord.targetName);
    lockToken = await api.acquireDirectoryInstallLock(initialTargetDir);

    // 等待锁期间事务可能已由正常安装流程完成，必须在锁内重新读取记录。
    const record = parseTransactionRecord((await api.readFile(transactionPath)).content);
    if (!record) {
      return;
    }

    const targetDir = posix.join(parentDir, record.targetName);
    const temporaryDir = posix.join(parentDir, record.temporaryName);
    const backupDir = posix.join(parentDir, record.backupName);
    const [targetStatus, temporaryStatus, backupStatus] = await Promise.all([
      api.getPathStatus(targetDir),
      api.getPathStatus(temporaryDir),
      api.getPathStatus(backupDir)
    ]);

    // 目标缺失且备份存在说明崩溃发生在备份与激活之间，优先恢复用户旧数据。
    if (!targetStatus.exists && backupStatus.exists) {
      await api.renameFile(backupDir, targetDir);
    } else if (targetStatus.exists && backupStatus.exists) {
      await api.trashFile(backupDir);
    }

    if (temporaryStatus.exists) {
      await api.trashFile(temporaryDir);
    }

    await api.trashFile(transactionPath);
  } catch (error: unknown) {
    // 恢复失败时保留事务记录，供下次扫描重试，不能影响正常资源扫描。
    await emitRecoveryFailure(onFailure, { transactionPath, error });
  } finally {
    if (lockToken) {
      try {
        await api.releaseDirectoryInstallLock(lockToken);
      } catch {
        // 锁释放失败交由主进程在渲染窗口销毁时兜底。
      }
    }
  }
}

/**
 * 恢复安装根目录中所有持久化目录安装事务。
 * @param parentDir - Skill 或 Widget 安装根目录
 * @param api - 恢复依赖
 */
export async function recoverDirectoryInstallTransactions(
  parentDir: string,
  api: DirectoryInstallRecoveryAPI,
  onFailure?: DirectoryInstallRecoveryFailureHandler
): Promise<void> {
  try {
    const { entries } = await api.readWorkspaceDirectory({ directoryPath: parentDir });
    const transactionNames = entries
      .filter((entry: { name: string; type: 'file' | 'directory' }): boolean => entry.type === 'file' && TRANSACTION_FILE_PATTERN.test(entry.name))
      .map((entry: { name: string; type: 'file' | 'directory' }): string => entry.name);

    await Promise.all(transactionNames.map((transactionName: string): Promise<void> => recoverTransaction(parentDir, transactionName, api, onFailure)));
  } catch (error: unknown) {
    // 安装根目录不可读时保持现状，后续扫描仍按原有容错策略执行。
    await emitRecoveryFailure(onFailure, { transactionPath: parentDir, error });
  }
}

/**
 * 安装目录文件，并按配置处理目标冲突、回滚和清理。
 * @param options - 目录安装配置
 * @returns 安装完成信号
 */
async function installDirectoryUnlocked(options: DirectoryInstallerOptions): Promise<void> {
  // 安装器自身是最后一道文件系统边界，不能依赖上游压缩包解析器完成路径校验。
  options.files.forEach((file: DirectoryInstallFile): void => {
    normalizeDirectoryInstallRelativePath(file.relativePath);
  });

  const targetDir = posix.join(options.targetDir);
  const parentDir = readParentPath(targetDir);
  const targetName = readBaseName(targetDir);
  const scratchNameFactory = options.scratchNameFactory ?? ((kind: 'temporary' | 'backup'): string => `.${kind === 'temporary' ? 'tmp' : 'bak'}-${nanoid(8)}`);
  const temporaryName = scratchNameFactory('temporary');
  const backupName = scratchNameFactory('backup');
  const transactionName = options.transactionNameFactory?.() ?? `.install-${nanoid(8)}.json`;
  if (
    !path.isValidSegment(targetName) ||
    !/^\.tmp-[A-Za-z0-9_-]+$/u.test(temporaryName) ||
    !/^\.bak-[A-Za-z0-9_-]+$/u.test(backupName) ||
    !TRANSACTION_FILE_PATTERN.test(transactionName)
  ) {
    throw new Error('目录安装事务路径不安全');
  }
  const temporaryDir = posix.join(parentDir, temporaryName);
  const backupDir = posix.join(parentDir, backupName);
  const transactionPath = posix.join(parentDir, transactionName);
  let backupCreated = false;
  let temporaryActive = false;
  let transactionActive = false;

  await emitInstallEvent(options.onEvent, { type: 'stage', stage: 'check-target' });
  const targetStatus = await options.api.getPathStatus(targetDir);
  if (targetStatus.exists && options.conflictStrategy === 'reject') {
    throw new DirectoryInstallConflictError(targetDir);
  }

  try {
    // 先创建安装根目录与事务记录，使写入临时文件期间的进程崩溃也可在下次扫描时恢复。
    await options.api.ensureDir(parentDir);
    const transaction: DirectoryInstallTransactionRecord = { version: 1, targetName, temporaryName, backupName };
    await options.api.writeFile(transactionPath, JSON.stringify(transaction));
    transactionActive = true;

    await emitInstallEvent(options.onEvent, { type: 'stage', stage: 'write-files' });
    await options.api.ensureDir(temporaryDir);
    temporaryActive = true;
    await Promise.all(options.files.map((file: DirectoryInstallFile): Promise<void> => writeInstallFile(options, temporaryDir, file)));

    if (options.conflictStrategy === 'reject') {
      // 临时文件写入期间目标可能被其他安装任务创建，激活前再次确认避免竞态覆盖。
      await emitInstallEvent(options.onEvent, { type: 'stage', stage: 'check-target' });
      const latestTargetStatus = await options.api.getPathStatus(targetDir);
      if (latestTargetStatus.exists) {
        throw new DirectoryInstallConflictError(targetDir);
      }
    }

    if (targetStatus.exists) {
      await emitInstallEvent(options.onEvent, { type: 'stage', stage: 'backup' });
      await renameDirectory(options, targetDir, backupDir, 'backup');
      backupCreated = true;
    }

    await emitInstallEvent(options.onEvent, { type: 'stage', stage: 'activate' });
    try {
      await renameDirectory(options, temporaryDir, targetDir, 'activate');
      temporaryActive = false;
    } catch (error: unknown) {
      if (backupCreated) {
        await emitInstallEvent(options.onEvent, { type: 'stage', stage: 'rollback' });
        try {
          await renameDirectory(options, backupDir, targetDir, 'rollback');
          backupCreated = false;
          await emitInstallEvent(options.onEvent, { type: 'rollback-completed' });
        } catch (rollbackError: unknown) {
          await emitInstallEvent(options.onEvent, { type: 'rollback-failed', error: rollbackError });
        }
      }
      throw error;
    }

    if (backupCreated) {
      await emitInstallEvent(options.onEvent, { type: 'stage', stage: 'cleanup' });
      const backupCleaned = await cleanupDirectory(options, backupDir, 'backup');
      if (!backupCleaned) {
        return;
      }
    }

    if (await cleanupDirectory(options, transactionPath, 'transaction')) {
      transactionActive = false;
    }
  } catch (error: unknown) {
    let temporaryCleaned = !temporaryActive;
    if (temporaryActive) {
      temporaryCleaned = await cleanupDirectory(options, temporaryDir, 'temporary');
    }

    // 回滚成功或尚未备份时已经没有恢复价值；回滚失败则必须保留事务记录。
    if (transactionActive && !backupCreated && temporaryCleaned) {
      try {
        await options.api.trashFile(transactionPath);
        transactionActive = false;
      } catch {
        // 事务记录清理失败不覆盖原始安装错误。
      }
    }
    throw error;
  }
}

/**
 * 在跨窗口目标锁内安装目录，避免多个渲染入口同时替换同一资源。
 * @param options - 目录安装配置
 * @returns 安装完成信号
 */
export async function installDirectory(options: DirectoryInstallerOptions): Promise<void> {
  const token = await options.api.acquireDirectoryInstallLock(posix.join(options.targetDir));
  try {
    await installDirectoryUnlocked(options);
  } finally {
    await options.api.releaseDirectoryInstallLock(token);
  }
}

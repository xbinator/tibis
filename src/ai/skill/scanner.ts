/**
 * @file scanner.ts
 * @description Skill 目录扫描器，仅发现资源目录索引。
 */
import type { SkillIndex, SkillScanConfig } from './types';
import { logDirectoryInstallRecoveryFailure } from '@/shared/logger/directoryInstall';
import { recoverDirectoryInstallTransactions } from '@/utils/file/directory';
import { canReadDirectory, type PathStatusReader } from '@/utils/file/status';
import { joinPath } from './parser';

/**
 * 扫描器依赖的平台 API 接口。
 * 仅声明扫描所需的方法，便于测试注入。
 */
export interface SkillScannerAPI extends PathStatusReader {
  /** 获取目标目录跨窗口安装锁。 */
  acquireDirectoryInstallLock?: (targetDir: string) => Promise<string>;
  /** 读取文件内容 */
  readFile: (filePath: string) => Promise<{ content: string }>;
  /** 读取工作区目录 */
  readWorkspaceDirectory: (options: {
    directoryPath: string;
    workspaceRoot?: string;
  }) => Promise<{ entries: Array<{ name: string; type: 'file' | 'directory' }> }>;
  /** 移动文件/目录到系统回收站 */
  trashFile?: (filePath: string) => Promise<void>;
  /** 重命名文件或目录，用于恢复中断的安装事务。 */
  renameFile?: (oldPath: string, newPath: string) => Promise<void>;
  /** 释放目标目录跨窗口安装锁。 */
  releaseDirectoryInstallLock?: (token: string) => Promise<void>;
}

/**
 * 扫描用户级 Skill 一级资源目录。
 * @param config - 扫描配置
 * @param api - electronAPI 实例
 * @returns Skill 目录索引
 */
export async function scanSkillDirectories(config: SkillScanConfig, api: SkillScannerAPI): Promise<SkillIndex[]> {
  // 扫描用户级全局 skill 目录。
  const globalSkillsDir = joinPath(config.homeDir, '.agents', 'skills');
  const hasGlobalSkillsDir = await canReadDirectory(globalSkillsDir, api);

  if (!hasGlobalSkillsDir) {
    return [];
  }

  // 只有带有效事务记录的中间目录才能恢复或清理，匿名备份不能被当作垃圾删除。
  if (api.trashFile && api.renameFile && api.getPathStatus && api.acquireDirectoryInstallLock && api.releaseDirectoryInstallLock) {
    await recoverDirectoryInstallTransactions(
      globalSkillsDir,
      {
        acquireDirectoryInstallLock: api.acquireDirectoryInstallLock,
        getPathStatus: api.getPathStatus,
        readFile: api.readFile,
        readWorkspaceDirectory: api.readWorkspaceDirectory,
        renameFile: api.renameFile,
        releaseDirectoryInstallLock: api.releaseDirectoryInstallLock,
        trashFile: api.trashFile
      },
      (failure) => logDirectoryInstallRecoveryFailure('skill', failure)
    );
  }

  try {
    const { entries } = await api.readWorkspaceDirectory({ directoryPath: globalSkillsDir });
    return entries
      .filter((entry): boolean => entry.type === 'directory' && !entry.name.startsWith('.'))
      .map((entry): SkillIndex => {
        const dirPath = joinPath(globalSkillsDir, entry.name);
        return {
          id: entry.name,
          dirPath,
          filePath: joinPath(dirPath, 'SKILL.md'),
          source: 'global'
        };
      });
  } catch {
    return [];
  }
}

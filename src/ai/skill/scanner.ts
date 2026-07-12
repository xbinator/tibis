/**
 * @file scanner.ts
 * @description Skill 目录扫描器，发现并解析 SKILL.md 文件。
 */
import type { SkillDefinition, SkillScanConfig } from './types';
import { logDirectoryInstallRecoveryFailure } from '@/shared/logger/directoryInstall';
import { recoverDirectoryInstallTransactions } from '@/utils/file/directory';
import { canReadDirectory, type PathStatusReader } from '@/utils/file/status';
import { parseSkillMarkdown, joinPath } from './parser';

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
 * 扫描指定目录下的 SKILL.md 文件。
 * @param dirPath - 要扫描的目录绝对路径
 * @param source - skill 来源标记
 * @param api - electronAPI 实例
 * @param maxContentLength - 内容最大长度
 * @returns 解析后的 SkillDefinition 数组
 */
async function scanDirectory(dirPath: string, source: SkillDefinition['source'], api: SkillScannerAPI, maxContentLength?: number): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = [];

  try {
    if (!(await canReadDirectory(dirPath, api))) {
      return [];
    }

    const { entries } = await api.readWorkspaceDirectory({ directoryPath: dirPath });
    // 排除 .tmp-*, .bak-* 等临时目录
    const dirEntries = entries.filter((e) => e.type === 'directory').filter((e) => !e.name.startsWith('.'));

    const results = await Promise.allSettled(
      dirEntries.map(async (entry) => {
        const skillDirPath = joinPath(dirPath, entry.name);
        const skillFilePath = joinPath(skillDirPath, 'SKILL.md');
        if (api.getPathStatus) {
          const status = await api.getPathStatus(skillFilePath);
          if (!status.exists || !status.isFile) {
            return null;
          }
        }
        const { content } = await api.readFile(skillFilePath);
        return parseSkillMarkdown(content, skillFilePath, { source, maxContentLength });
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        skills.push(result.value);
      }
    }
  } catch {
    // 目录不存在或不可读，跳过
  }

  return skills;
}

/**
 * 扫描所有来源的 Skill。
 * 扫描当前工作区统一的 Skill 目录。
 * @param config - 扫描配置
 * @param api - electronAPI 实例
 * @returns 去重后的 SkillDefinition 数组
 */
export async function scanSkills(config: SkillScanConfig, api: SkillScannerAPI): Promise<SkillDefinition[]> {
  const { maxContentLength } = config;

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

  const globalSkills = await scanDirectory(globalSkillsDir, 'global', api, maxContentLength);

  // 去重：同名 Skill 后者覆盖前者；解析错误也是最新磁盘状态，必须保留。
  const skillMap = new Map<string, SkillDefinition>();
  for (const skill of globalSkills) {
    const key = skill.name || skill.filePath;
    skillMap.set(key, skill);
  }

  return Array.from(skillMap.values());
}

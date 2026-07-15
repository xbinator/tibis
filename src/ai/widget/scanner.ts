/**
 * @file scanner.ts
 * @description 小组件目录扫描器。
 */
import type { WidgetDefinition, WidgetScanConfig } from './types';
import { logDirectoryInstallRecoveryFailure } from '@/shared/logger/directoryInstall';
import { recoverDirectoryInstallTransactions } from '@/utils/file/directory';
import { posix } from '@/utils/file/posix';
import { canReadDirectory, type PathStatusReader } from '@/utils/file/status';
import { parseWidgetJson } from './parser';

/**
 * 小组件扫描器依赖的平台 API 接口。
 */
export interface WidgetScannerAPI extends PathStatusReader {
  /** 获取目标目录跨窗口安装锁。 */
  acquireDirectoryInstallLock?: (targetDir: string) => Promise<string>;
  /** 读取文件内容 */
  readFile: (filePath: string) => Promise<{ content: string }>;
  /** 读取工作区目录 */
  readWorkspaceDirectory: (options: {
    directoryPath: string;
    workspaceRoot?: string;
  }) => Promise<{ entries: Array<{ name: string; type: 'file' | 'directory' }> }>;
  /** 移动文件或目录到回收站。 */
  trashFile?: (filePath: string) => Promise<void>;
  /** 重命名文件或目录。 */
  renameFile?: (oldPath: string, newPath: string) => Promise<void>;
  /** 释放目标目录跨窗口安装锁。 */
  releaseDirectoryInstallLock?: (token: string) => Promise<void>;
}

/**
 * 判断目录项是否为可扫描的小组件目录。
 * @param entry - 目录项
 * @returns 是否为小组件目录
 */
function isWidgetDirectoryEntry(entry: { name: string; type: 'file' | 'directory' }): boolean {
  return entry.type === 'directory' && !entry.name.startsWith('.');
}

/**
 * 扫描用户小组件目录。
 * @param config - 扫描配置
 * @param api - 扫描依赖 API
 * @returns 小组件定义列表
 */
export async function scanWidgets(config: WidgetScanConfig, api: WidgetScannerAPI): Promise<WidgetDefinition[]> {
  const widgetDir = posix.join(config.homeDir, '.tibis', 'widgets');

  try {
    if (!(await canReadDirectory(widgetDir, api))) {
      return [];
    }

    if (api.trashFile && api.renameFile && api.getPathStatus && api.acquireDirectoryInstallLock && api.releaseDirectoryInstallLock) {
      await recoverDirectoryInstallTransactions(
        widgetDir,
        {
          acquireDirectoryInstallLock: api.acquireDirectoryInstallLock,
          getPathStatus: api.getPathStatus,
          readFile: api.readFile,
          readWorkspaceDirectory: api.readWorkspaceDirectory,
          renameFile: api.renameFile,
          releaseDirectoryInstallLock: api.releaseDirectoryInstallLock,
          trashFile: api.trashFile
        },
        (failure) => logDirectoryInstallRecoveryFailure('widget', failure)
      );
    }

    const { entries } = await api.readWorkspaceDirectory({ directoryPath: widgetDir });
    const widgetEntries = entries.filter(isWidgetDirectoryEntry);
    const results = await Promise.allSettled(
      widgetEntries.map(async (entry: { name: string; type: 'file' | 'directory' }): Promise<WidgetDefinition> => {
        const filePath = posix.join(widgetDir, entry.name, 'widget.json');
        const { content } = await api.readFile(filePath);

        return parseWidgetJson(content, filePath);
      })
    );

    return results.flatMap((result): WidgetDefinition[] => (result.status === 'fulfilled' ? [result.value] : []));
  } catch {
    return [];
  }
}

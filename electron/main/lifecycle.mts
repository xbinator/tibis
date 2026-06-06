/**
 * @file lifecycle.mts
 * @description Electron 主进程生命周期策略判断。
 */
import { fileURLToPath } from 'node:url';

/**
 * 待打开文件队列。
 */
export interface PendingOpenFileQueue {
  /** 追加一个待打开文件路径。 */
  enqueue: (filePath: string) => void;
  /** 消费并清空当前待打开文件路径。 */
  consume: () => string[];
  /** 是否存在待打开文件路径。 */
  hasPending: () => boolean;
}

const MARKDOWN_FILE_PATH_PATTERN = /\.(?:md|markdown)$/i;

/**
 * 判断关闭所有窗口时是否可以同步关闭数据库连接。
 * macOS 关闭所有窗口后应用仍保持运行，后续激活会复用既有主进程和 IPC handler。
 * @param platform - Node.js 平台标识
 * @returns 是否应在 window-all-closed 阶段关闭数据库
 */
export function shouldCloseDatabaseOnWindowAllClosed(platform: NodeJS.Platform): boolean {
  return platform !== 'darwin';
}

/**
 * 判断关闭所有窗口时是否应退出应用。
 * @param platform - Node.js 平台标识
 * @returns 是否应调用 app.quit()
 */
export function shouldQuitOnWindowAllClosed(platform: NodeJS.Platform): boolean {
  return platform !== 'darwin';
}

/**
 * 判断外部快捷动作是否应等待主进程启动完成后再处理。
 * @param bootstrapReady - 主进程是否已完成资源初始化、IPC 注册和首个窗口创建
 * @returns 是否需要延后处理快捷动作
 */
export function shouldDeferShortcutActionUntilBootstrapReady(bootstrapReady: boolean): boolean {
  return !bootstrapReady;
}

/**
 * 将命令行参数归一化为可打开文件路径。
 * @param arg - 命令行参数
 * @returns 可打开文件路径；不支持时返回 null
 */
function normalizeOpenFileArg(arg: string): string | null {
  const trimmedArg = arg.trim();
  if (!trimmedArg || trimmedArg.startsWith('-')) return null;

  try {
    const filePath = trimmedArg.startsWith('file://') ? fileURLToPath(trimmedArg) : trimmedArg;
    return MARKDOWN_FILE_PATH_PATTERN.test(filePath) ? filePath : null;
  } catch {
    return null;
  }
}

/**
 * 从应用启动或第二实例命令行参数中提取 Markdown 文件路径。
 * @param argv - 命令行参数数组
 * @returns 需要由编辑器打开的 Markdown 文件路径列表
 */
export function resolveOpenFilePathsFromArgv(argv: string[]): string[] {
  return argv.map(normalizeOpenFileArg).filter((filePath): filePath is string => filePath !== null);
}

/**
 * 创建待打开文件队列，供主进程跨启动阶段保存系统传入的文件路径。
 * @returns 待打开文件队列
 */
export function createPendingOpenFileQueue(): PendingOpenFileQueue {
  const filePaths: string[] = [];

  return {
    enqueue(filePath: string): void {
      if (filePath.trim().length === 0) return;
      filePaths.push(filePath);
    },
    consume(): string[] {
      return filePaths.splice(0);
    },
    hasPending(): boolean {
      return filePaths.length > 0;
    }
  };
}

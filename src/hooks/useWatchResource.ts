/**
 * @file useWatchResource.ts
 * @description 通用资源监听 hook，负责扫描用户目录、监听变更及增量更新到 Store。
 *              适用于按根目录（如 `.agents`、`.tibis`）+ 子目录（如 `skills`、`widgets`）
 *              下单一类型文件（如 `SKILL.md`、`widget.json`）管理的 Store 同步场景。
 */

import { onMounted, onUnmounted } from 'vue';
import { native } from '@/shared/platform';
import type { Native } from '@/shared/platform/native/types';
import { asyncTo } from '@/utils/asyncTo';
import { posix } from '@/utils/file/posix';

/** 通用资源监听配置。 */
export interface WatchResourceConfig<TDefinition> {
  /**
   * 根目录名（带 `.`），紧邻用户主目录的固定目录，例如 `.agents`、`.tibis`。
   * 监听目录 = `~/${rootDir}/${subDir}`。
   */
  rootDir: string;
  /** 根目录下的子目录名，例如 `skills`、`widgets`。 */
  subDir: string;
  /** 监听该目录时的 glob 模式，例如 `**\/SKILL.md`、`**\/widget.json`。 */
  watchGlob: string;

  /** Store 准备初始化方法（建立屏障）。 */
  prepareInitialization: () => void;
  /** Store 初始化方法（执行扫描）。 */
  init: (homeDir: string, api: Native) => Promise<void>;
  /** Store 初始化结束方法（释放屏障）。 */
  finishInitialization: () => void;
  /** Store 处理变更方法。 */
  handleChange: (type: 'change' | 'add' | 'unlink', definition: TDefinition) => void;

  /**
   * 解析文件内容。
   * @param content - 文件内容
   * @param filePath - 文件绝对路径
   * @returns 解析后的定义
   */
  parseFile: (content: string, filePath: string) => TDefinition;
  /**
   * 为 unlink 事件构造仅含路径信息的占位定义。
   * @param filePath - 规范化后的文件绝对路径
   * @returns 用于通知 Store 删除的占位定义
   */
  createUnlinkPayload: (filePath: string) => TDefinition;
  /**
   * 判断变更路径是否需要进入 Store。
   * @param normalizedPath - 已使用 / 统一分隔符的文件路径
   * @returns 是否需要处理
   */
  isTargetFile: (normalizedPath: string) => boolean;
  /** 初始化失败时的日志标签，例如 'Skill' / 'Widget'。 */
  logLabel: string;
}

/**
 * 获取 `${rootDir}/${subDir}` 下的目录片段。
 * @param normalizedPath - 已使用 / 统一分隔符的文件路径
 * @param rootDir - 根目录名（带 `.`）
 * @param subDir - 子目录名
 * @returns 根目录之后、文件名之前的路径片段
 */
function getDirectorySegments(normalizedPath: string, rootDir: string, subDir: string): string[] {
  const segments = normalizedPath.split('/');
  const rootIndex = segments.lastIndexOf(rootDir);

  if (rootIndex === -1 || segments[rootIndex + 1] !== subDir) {
    return [];
  }

  return segments.slice(rootIndex + 2, -1);
}

/**
 * 判断路径是否位于隐藏目录。
 * @param normalizedPath - 已使用 / 统一分隔符的文件路径
 * @param rootDir - 根目录名（带 `.`）
 * @param subDir - 子目录名
 * @returns 隐藏目录下的文件返回 true
 */
function isHiddenPath(normalizedPath: string, rootDir: string, subDir: string): boolean {
  return getDirectorySegments(normalizedPath, rootDir, subDir).some((segment: string): boolean => segment.startsWith('.'));
}

/**
 * 创建判断资源文件路径的工具函数：先排除隐藏目录，再交由业务谓词判断。
 * @param rootDir - 根目录名（带 `.`）
 * @param subDir - 子目录名
 * @param predicate - 业务自定义的最终匹配条件
 * @returns 路径判断函数
 */
export function createResourceMatcher(rootDir: string, subDir: string, predicate: (normalizedPath: string) => boolean): (normalizedPath: string) => boolean {
  return (normalizedPath: string): boolean => !isHiddenPath(normalizedPath, rootDir, subDir) && predicate(normalizedPath);
}

/**
 * 启动资源监听：订阅变更事件、注册目录观察、调用 Store 初始化。
 * 任一步骤失败直接抛错，由调用方统一处理屏障释放。
 * @param config - 通用配置
 * @param cleanupCallbacks - 注册待执行的清理函数
 */
async function startWatching<TDefinition>(config: WatchResourceConfig<TDefinition>, cleanupCallbacks: Array<() => void | Promise<void>>): Promise<void> {
  // 先订阅事件，避免异步扫描与 watcher 注册期间丢失磁盘变化。
  const removeChangeListener = native.onSkillChanged((data: { type: string; filePath: string; content?: string }): void => {
    // 统一规范化路径分隔符，Windows 下 Chokidar 报告 \ 而 scanner 使用 /
    const normalizedPath = data.filePath.replace(/\\/g, '/');
    if (!config.isTargetFile(normalizedPath)) {
      return;
    }

    if (data.type === 'unlink') {
      config.handleChange('unlink', config.createUnlinkPayload(normalizedPath));
      return;
    }

    if (!data.content) {
      return;
    }

    config.handleChange(data.type as 'change' | 'add', config.parseFile(data.content, normalizedPath));
  });
  cleanupCallbacks.push(removeChangeListener);

  const homeDir = await native.getHomeDir();
  // 监听用户级全局目录，事件只关注配置中指定的 glob 文件。
  const targetDir = posix.join(homeDir, config.rootDir, config.subDir);
  await native.watchDirectory(targetDir, config.watchGlob);
  cleanupCallbacks.push((): Promise<void> => native.unwatchDirectory(targetDir, config.watchGlob));

  await config.init(homeDir, native);
}

/**
 * 执行所有清理函数；每个清理都通过 `asyncTo` 隔离异常，避免单个失败阻塞其他清理。
 * 按注册顺序串行等待每个清理完成（监听器需先解绑再删文件等）。
 * @param cleanupCallbacks - 待执行的清理函数集合
 */
async function runCleanup(cleanupCallbacks: Array<() => void | Promise<void>>): Promise<void> {
  for (const cleanup of cleanupCallbacks.splice(0)) {
    // eslint-disable-next-line no-await-in-loop -- 清理顺序敏感，需串行等待
    await asyncTo(Promise.resolve(cleanup()));
  }
}

/**
 * 监听用户目录下的资源并同步到 Store：扫描文件、订阅变更、增量更新。
 * 在组件 onMounted 时自动执行初始化，onUnmounted 时自动清理监听。
 * @param config - 通用配置
 */
export function useWatchResource<TDefinition>(config: WatchResourceConfig<TDefinition>): void {
  // setup 阶段先建立屏障，避免布局 onMounted 前聊天绕过资源初始化。
  config.prepareInitialization();

  /** 组件卸载时需要执行的清理函数。 */
  const cleanupCallbacks: Array<() => void | Promise<void>> = [];

  onMounted(async () => {
    const [error] = await asyncTo(startWatching(config, cleanupCallbacks));

    error && config.finishInitialization();
  });

  onUnmounted(() => {
    runCleanup(cleanupCallbacks).catch(() => undefined);
  });
}

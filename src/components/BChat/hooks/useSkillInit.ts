/**
 * @file useSkillInit.ts
 * @description 初始化 Skill Store 的 hook，负责扫描 skill 目录、监听目录变更及增量更新。
 */

import { onMounted, onUnmounted } from 'vue';
import { joinPath, parseSkillMarkdown } from '@/ai/skill';
import { native } from '@/shared/platform';
import type { ReadWorkspaceDirectoryOptions } from '@/shared/platform/native/types';
import { useSkillStore } from '@/stores/ai/skill';

/**
 * 获取 `.agents/skills` 下的目录片段。
 * @param normalizedPath - 已使用 / 统一分隔符的文件路径
 * @returns Skill 根目录之后、文件名之前的路径片段
 */
function getSkillDirectorySegments(normalizedPath: string): string[] {
  const segments = normalizedPath.split('/');
  const agentsIndex = segments.lastIndexOf('.agents');

  if (agentsIndex === -1 || segments[agentsIndex + 1] !== 'skills') {
    return [];
  }

  return segments.slice(agentsIndex + 2, -1);
}

/**
 * 判断路径是否位于 Skill 隐藏目录。
 * @param normalizedPath - 已使用 / 统一分隔符的文件路径
 * @returns 隐藏目录下的文件返回 true
 */
function isHiddenSkillPath(normalizedPath: string): boolean {
  return getSkillDirectorySegments(normalizedPath).some((segment: string): boolean => segment.startsWith('.'));
}

/**
 * 判断变更路径是否是需要进入 Store 的正式 Skill 文件。
 * @param normalizedPath - 已使用 / 统一分隔符的文件路径
 * @returns 正式 Skill 文件返回 true
 */
function isManagedSkillFilePath(normalizedPath: string): boolean {
  return normalizedPath.endsWith('/SKILL.md') && !isHiddenSkillPath(normalizedPath);
}

/**
 * 初始化 Skill Store：扫描 skill 目录并监听变更。
 * 在组件 onMounted 时自动执行初始化，onUnmounted 时自动清理监听。
 */
export function useSkillInit(): void {
  const skillStore = useSkillStore();
  // setup 阶段先建立屏障，避免布局 onMounted 前聊天绕过资源初始化。
  skillStore.prepareInitialization();

  /** 组件卸载时需要执行的 skill 监听清理函数。 */
  const cleanupCallbacks: Array<() => void | Promise<void>> = [];

  onMounted(async () => {
    try {
      // 先订阅事件，避免异步扫描与 watcher 注册期间丢失磁盘变化。
      const removeSkillChangedListener = native.onSkillChanged(async (data) => {
        // 统一规范化路径分隔符，Windows 下 Chokidar 报告 \ 而 scanner 使用 /
        const normalizedPath = data.filePath.replace(/\\/g, '/');
        if (!isManagedSkillFilePath(normalizedPath)) return;

        if (data.type === 'unlink') {
          skillStore.handleSkillChange('unlink', { filePath: normalizedPath } as import('@/ai/skill/types').SkillDefinition);
          return;
        }
        // change/add：重新解析文件
        if (data.content) {
          const skill = parseSkillMarkdown(data.content, normalizedPath, { source: 'global' });
          skillStore.handleSkillChange(data.type as 'change' | 'add', skill);
        }
      });
      cleanupCallbacks.push(removeSkillChangedListener);

      const homeDir = await native.getHomeDir();
      // 监听用户级全局 skill 目录，事件只关注 SKILL.md。
      const skillDir = joinPath(homeDir, '.agents', 'skills');
      await native.watchDirectory(skillDir, '**/SKILL.md');
      cleanupCallbacks.push(() => native.unwatchDirectory(skillDir, '**/SKILL.md'));

      await skillStore.init(homeDir, {
        readFile: (filePath: string) => native.readFile(filePath).then((r) => ({ content: r.content })),
        readWorkspaceDirectory: (options: ReadWorkspaceDirectoryOptions) => native.readWorkspaceDirectory(options),
        getPathStatus: (targetPath: string) => native.getPathStatus(targetPath),
        trashFile: (filePath: string) => native.trashFile(filePath)
      });
    } catch (error: unknown) {
      console.error('Skill initialization failed:', error);
      skillStore.finishInitialization();
    }
  });

  onUnmounted(() => {
    for (const cleanup of cleanupCallbacks.splice(0)) {
      const result = cleanup();
      if (result instanceof Promise) {
        result.catch((error: unknown) => {
          console.error('Skill cleanup failed:', error);
        });
      }
    }
  });
}

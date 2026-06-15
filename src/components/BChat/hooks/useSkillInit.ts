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
 * 初始化 Skill Store：扫描 skill 目录并监听变更。
 * 在组件 onMounted 时自动执行初始化，onUnmounted 时自动清理监听。
 */
export function useSkillInit(): void {
  const skillStore = useSkillStore();

  /** 组件卸载时需要执行的 skill 监听清理函数。 */
  const cleanupCallbacks: Array<() => void | Promise<void>> = [];

  onMounted(async () => {
    try {
      const homeDir = await native.getHomeDir();
      await skillStore.init(homeDir, {
        readFile: (filePath: string) => native.readFile(filePath).then((r) => ({ content: r.content })),
        readWorkspaceDirectory: (options: ReadWorkspaceDirectoryOptions) => native.readWorkspaceDirectory(options),
        getPathStatus: (targetPath: string) => native.getPathStatus(targetPath),
        trashFile: (filePath: string) => native.trashFile(filePath)
      });

      // 监听用户级全局 skill 目录，事件只关注 SKILL.md。
      const skillDir = joinPath(homeDir, '.agents', 'skills');
      await native.watchDirectory(skillDir, '**/SKILL.md');
      cleanupCallbacks.push(() => native.unwatchDirectory(skillDir, '**/SKILL.md'));

      // 监听 skill:changed 事件，增量更新
      const removeSkillChangedListener = native.onSkillChanged(async (data) => {
        // 统一规范化路径分隔符，Windows 下 Chokidar 报告 \ 而 scanner 使用 /
        const normalizedPath = data.filePath.replace(/\\/g, '/');
        if (data.type === 'unlink') {
          if (!normalizedPath.endsWith('/SKILL.md')) return;
          skillStore.handleSkillChange('unlink', { filePath: normalizedPath } as import('@/ai/skill/types').SkillDefinition);
          return;
        }
        // change/add：重新解析文件
        if (data.content) {
          if (!normalizedPath.endsWith('/SKILL.md')) return;
          const skill = parseSkillMarkdown(data.content, normalizedPath, { source: 'global' });
          skillStore.handleSkillChange(data.type as 'change' | 'add', skill);
        }
      });
      cleanupCallbacks.push(removeSkillChangedListener);
    } catch (error: unknown) {
      console.error('Skill initialization failed:', error);
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

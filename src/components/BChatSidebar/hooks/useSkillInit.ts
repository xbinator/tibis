/**
 * @file useSkillInit.ts
 * @description 初始化 Skill Store 的 hook，负责扫描 skill 目录、监听目录变更及增量更新。
 */

import { onMounted, onUnmounted } from 'vue';
import { native } from '@/shared/platform';
import type { ReadWorkspaceDirectoryOptions } from '@/shared/platform/native/types';
import { useSkillStore } from '@/stores/ai/skill';

/**
 * 初始化 Skill Store：扫描 skill 目录并监听变更。
 * 在组件 onMounted 时自动执行初始化，onUnmounted 时自动清理监听。
 */
export function useSkillInit(): void {
  const skillStore = useSkillStore();

  /** skill:changed 事件取消函数 */
  let offSkillChanged: (() => void) | null = null;

  onMounted(async () => {
    try {
      const cwd = await native.getCwd();
      await skillStore.init(cwd, {
        readFile: (filePath: string) => native.readFile(filePath).then((r) => ({ content: r.content })),
        readWorkspaceDirectory: (options: ReadWorkspaceDirectoryOptions) => native.readWorkspaceDirectory(options)
      });

      // 监听 skill 目录变化
      const skillDir = `${cwd}/.agents/skills`;
      await native.watchDirectory(skillDir, '**/SKILL.md');

      // 监听 skill:changed 事件，增量更新
      offSkillChanged = native.onSkillChanged(async (data) => {
        if (data.type === 'unlink') {
          if (!data.filePath.endsWith('/SKILL.md') && !data.filePath.endsWith('\\SKILL.md')) return;
          skillStore.handleSkillChange('unlink', { filePath: data.filePath } as import('@/ai/skill/types').SkillDefinition);
          return;
        }
        // change/add：重新解析文件
        if (data.content) {
          if (!data.filePath.endsWith('/SKILL.md') && !data.filePath.endsWith('\\SKILL.md')) return;
          const { parseSkillMarkdown } = await import('@/ai/skill/parser');
          const source = data.filePath.startsWith(`${cwd}/.agents/skills/`) ? 'project' : 'user';
          const skill = parseSkillMarkdown(data.content, data.filePath, { source });
          skillStore.handleSkillChange(data.type as 'change' | 'add', skill);
        }
      });
    } catch (error: unknown) {
      console.error('Skill initialization failed:', error);
    }
  });

  onUnmounted(() => {
    offSkillChanged?.();
  });
}

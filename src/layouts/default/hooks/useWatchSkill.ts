/**
 * @file useWatchSkill.ts
 * @description 默认布局的 Skill 资源监听 hook，委托给通用 useWatchResource。
 */

import { parseSkillMarkdown } from '@/ai/skill/parser';
import type { SkillDefinition } from '@/ai/skill/types';
import { useWatchResource } from '@/hooks/useWatchResource';
import { native } from '@/shared/platform';
import { useSkillStore } from '@/stores/ai/skill';

/**
 * 为 unlink 事件构造仅含路径信息的占位定义。
 * @param filePath - 规范化后的文件绝对路径
 * @returns 占位 SkillDefinition
 */
function createUnlinkPayload(filePath: string): SkillDefinition {
  return {
    name: '',
    description: '',
    content: '',
    filePath,
    dirPath: filePath,
    source: 'global',
    enabled: true,
    parsedAt: 0
  } as SkillDefinition;
}

/**
 * 监听 skill 目录并同步到 Skill Store：扫描文件、订阅变更、增量更新。
 * 在组件 onMounted 时自动执行初始化，onUnmounted 时自动清理监听。
 */
export function useWatchSkill(): void {
  const skillStore = useSkillStore();

  useWatchResource<SkillDefinition>({
    rootDir: '.agents',
    subDir: 'skills',
    logLabel: 'Skill',
    onBeforeInitialize: (): void => skillStore.beforeInitialize(),
    onAfterInitialize: (): void => skillStore.afterInitialize(),
    onInitialize: (homeDir: string): Promise<void> => skillStore.initialize(homeDir, native),
    onDirectoryChange: (): Promise<void> => skillStore.syncFromDisk(),
    onChange: (type, definition): void => skillStore.handleSkillChange(type, definition),
    onParseFile: (content: string, filePath: string): SkillDefinition => parseSkillMarkdown(content, filePath, { source: 'global' }),
    onCreateUnlinkPayload: createUnlinkPayload,
    // 路径以 /SKILL.md 结尾即为正式 Skill 文件；隐藏目录过滤已由 useWatchResource 内部处理
    onIsTargetFile: (normalizedPath: string): boolean => /\/SKILL\.md$/.test(normalizedPath)
  });
}

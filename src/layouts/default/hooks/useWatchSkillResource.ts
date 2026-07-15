/**
 * @file useWatchSkillResource.ts
 * @description 默认布局的 Skill 资源监听 hook，委托给通用 useWatchResource。
 */

import { parseSkillMarkdown } from '@/ai/skill';
import type { SkillDefinition } from '@/ai/skill/types';
import { useWatchResource, createResourceMatcher } from '@/hooks/useWatchResource';
import { native } from '@/shared/platform';
import { useSkillStore } from '@/stores/ai/skill';

/**
 * 判断变更路径是否是需要进入 Store 的正式 Skill 文件。
 * @param normalizedPath - 已使用 / 统一分隔符的文件路径
 * @returns 正式 Skill 文件返回 true
 */
const isManagedSkillFile = createResourceMatcher('.agents', 'skills', (normalizedPath: string): boolean => normalizedPath.endsWith('/SKILL.md'));

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
export function useWatchSkillResource(): void {
  const skillStore = useSkillStore();

  useWatchResource<SkillDefinition>({
    rootDir: '.agents',
    subDir: 'skills',
    watchGlob: '**/SKILL.md',
    logLabel: 'Skill',
    prepareInitialization: (): void => skillStore.prepareInitialization(),
    finishInitialization: (): void => skillStore.finishInitialization(),
    init: (homeDir: string): Promise<void> => skillStore.init(homeDir, native),
    handleChange: (type, definition): void => skillStore.handleSkillChange(type, definition),
    parseFile: (content: string, filePath: string): SkillDefinition => parseSkillMarkdown(content, filePath, { source: 'global' }),
    createUnlinkPayload,
    isTargetFile: isManagedSkillFile
  });
}

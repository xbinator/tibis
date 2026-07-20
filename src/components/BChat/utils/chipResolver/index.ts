/**
 * @file index.ts
 * @description 组合聊天输入框文件引用与技能引用 Chip 解析器。
 */
import type { ChipResolver } from '@/components/BSmart/extensions/variableChip';
import { parseFileReferenceToken, type FileReferenceNavigationTarget } from '@/utils/file/reference';
import { parseSkillReferenceBody } from '../skillReference';
import { createFileReferenceWidget } from './file/widget';
import { createSkillReferenceWidget } from './skill/widget';

/**
 * 创建文件引用 Chip 解析器。
 * @param onOpenFile - 文件打开回调
 * @returns BSmartEditor 可用的 Chip 解析器
 */
export function createFileRefChipResolver(onOpenFile: (target: FileReferenceNavigationTarget) => void): ChipResolver {
  return (content: string): ReturnType<ChipResolver> => {
    if (!content.startsWith('@')) return null;

    const parsed = parseFileReferenceToken(content);
    return parsed ? { widget: createFileReferenceWidget(parsed, onOpenFile) } : null;
  };
}

/**
 * 创建聊天输入框完整 Chip 解析器。
 * @param onOpenFile - 文件打开回调
 * @param onOpenSkill - Skill 详情打开回调
 * @returns 同时支持文件引用与技能引用的解析器
 */
export function createChatChipResolver(onOpenFile: (target: FileReferenceNavigationTarget) => void, onOpenSkill: (skillName: string) => void): ChipResolver {
  const fileResolver = createFileRefChipResolver(onOpenFile);

  return (content: string): ReturnType<ChipResolver> => {
    const skillName = parseSkillReferenceBody(content);
    return skillName ? { widget: createSkillReferenceWidget(skillName, onOpenSkill) } : fileResolver(content);
  };
}

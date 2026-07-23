/**
 * @file skill.ts
 * @description 收口 Skill 独立详情页导航行为。
 */
import type { SkillNavigationActions } from '../types';
import { useRouter } from 'vue-router';

/**
 * 创建 Skill 导航能力。
 * @returns Skill 导航动作
 */
export function useSkillNavigation(): SkillNavigationActions {
  const router = useRouter();

  /**
   * 打开指定 Skill 的独立详情页。
   * @param skillName - Skill frontmatter 名称
   */
  function openSkill(skillName: string): void {
    router.push({ name: 'skill', params: { name: skillName } });
  }

  return { openSkill };
}

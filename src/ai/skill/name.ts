/**
 * @file name.ts
 * @description Skill 名称的共享格式约束。
 */

/** SkillReference Token 无法承载的名称字符。 */
const INVALID_SKILL_NAME_PATTERN = /[{}\r\n]/u;

/**
 * 判断 Skill 名称是否能稳定用于存储和引用。
 * @param name - 已归一化的 Skill 名称
 * @returns 名称是否有效
 */
export function isValidSkillName(name: string): boolean {
  return Boolean(name) && !INVALID_SKILL_NAME_PATTERN.test(name);
}

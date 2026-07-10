/**
 * @file types.ts
 * @description Skill 系统类型定义。
 */

/** Skill 来源类型。 */
export type SkillSource = 'builtin' | 'global';

/** Skill 目录变更事件类型。 */
export type SkillChangeEventType = 'change' | 'add' | 'unlink';

/** SKILL.md 解析结果。 */
export interface SkillDefinition {
  /** skill 唯一标识，来自 frontmatter name 字段 */
  name: string;
  /** 触发场景描述，来自 frontmatter description 字段 */
  description: string;
  /** 完整指令内容（SKILL.md body 部分） */
  content: string;
  /** 完整 SKILL.md 源文本的稳定内容版本 */
  contentHash?: string;
  /** SKILL.md 文件绝对路径 */
  filePath: string;
  /** skill 目录绝对路径 */
  dirPath: string;
  /** 来源：builtin（内置）| global（用户级全局目录） */
  source: SkillSource;
  /** 是否启用 */
  enabled: boolean;
  /** 解析时间戳，用于 UI 展示"上次解析时间" */
  parsedAt: number;
  /** 解析失败时的错误信息 */
  parseError?: string;
  /** 内容是否因超长而被截断 */
  truncated?: boolean;
}

/** Skill 扫描配置。 */
export interface SkillScanConfig {
  /** 用户主目录路径 */
  homeDir: string;
  /** skill body 最大字符数，默认 10000 */
  maxContentLength?: number;
}

/** Skill 目录变更事件载荷。 */
export interface SkillChangeEvent {
  /** 事件类型 */
  type: SkillChangeEventType;
  /** 受影响的 SKILL.md 文件路径 */
  filePath: string;
}

/** Skill body 默认最大字符数。 */
export const DEFAULT_SKILL_MAX_CONTENT_LENGTH = 10000;

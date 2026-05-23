/**
 * @file types.ts
 * @description Skill 系统类型定义。
 */

/** Skill 来源类型。 */
export type SkillSource = 'builtin' | 'project' | 'user';

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
  /** SKILL.md 文件绝对路径 */
  filePath: string;
  /** skill 目录绝对路径 */
  dirPath: string;
  /** 来源：builtin（内置）| project（项目目录）| user（用户配置路径） */
  source: SkillSource;
  /** 是否启用 */
  enabled: boolean;
  /** 解析时间戳，用于 UI 展示"上次解析时间" */
  parsedAt: number;
  /** 解析失败时的错误信息 */
  parseError?: string;
}

/** Skill 扫描配置。 */
export interface SkillScanConfig {
  /** 项目工作区根路径 */
  workspaceRoot: string;
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

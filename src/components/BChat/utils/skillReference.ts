/**
 * @file skillReference.ts
 * @description SkillReference Token 的创建、解析、查找与消息草稿恢复工具。
 */
import type { ChatMessagePart } from 'types/chat';
import { isValidSkillName } from '@/ai/skill/name';

/** SkillReference Token 内部 body 前缀。 */
const SKILL_REFERENCE_BODY_PREFIX = '$';
/** SkillReference Token 匹配模式。 */
const SKILL_REFERENCE_PATTERN = /\{\{\$([^{}\r\n]+)\}\}/gu;

/**
 * SkillReference Token 匹配结果。
 */
export interface SkillReferenceTokenMatch {
  /** Skill 名称。 */
  name: string;
  /** Token 起始 offset。 */
  start: number;
  /** Token 结束 offset。 */
  end: number;
  /** 原始 Token。 */
  token: string;
}

/**
 * 创建可逆且可读的 SkillReference Token。
 * @param name - Skill frontmatter 名称
 * @returns 编辑器内部 Token
 */
export function createSkillReferenceToken(name: string): string {
  if (!isValidSkillName(name)) {
    throw new Error('Skill name must be non-empty and cannot contain braces or line breaks');
  }

  return `{{${SKILL_REFERENCE_BODY_PREFIX}${name}}}`;
}

/**
 * 从变量装饰 body 中解析 Skill 名称。
 * @param body - `{{...}}` 内部文本
 * @returns Skill 名称，非 SkillReference 或名称不合法时返回 null
 */
export function parseSkillReferenceBody(body: string): string | null {
  if (!body.startsWith(SKILL_REFERENCE_BODY_PREFIX)) return null;

  const name = body.slice(SKILL_REFERENCE_BODY_PREFIX.length);
  return isValidSkillName(name) ? name : null;
}

/**
 * 查找文本中的全部合法 SkillReference Token。
 * @param text - 编辑器原始文本
 * @returns 按来源顺序排列的 Token
 */
export function findSkillReferenceTokens(text: string): SkillReferenceTokenMatch[] {
  const matches: SkillReferenceTokenMatch[] = [];

  for (const match of text.matchAll(SKILL_REFERENCE_PATTERN)) {
    const name = parseSkillReferenceBody(`${SKILL_REFERENCE_BODY_PREFIX}${match[1]}`);
    if (!name) continue;

    matches.push({
      name,
      start: match.index,
      end: match.index + match[0].length,
      token: match[0]
    });
  }

  return matches;
}

/**
 * 创建用户可读的 SkillReference 文本投影。
 * @param name - Skill 名称
 * @returns 不含内部 `$` 标记的技能名
 */
export function projectSkillReference(name: string): string {
  return name;
}

/**
 * 从结构化用户消息恢复编辑器原始 Token。
 * 只有存在 SkillReference part 时才重建，旧消息继续原样使用 content。
 * @param content - 消息可读正文
 * @param parts - 有序消息片段
 * @returns 可写入编辑器的草稿文本
 */
export function restoreSkillReferenceTokens(content: string, parts: ChatMessagePart[]): string {
  if (!parts.some((part: ChatMessagePart): boolean => part.type === 'skill_reference')) return content;

  return parts
    .map((part: ChatMessagePart): string => {
      if (part.type === 'text') return part.text;
      if (part.type === 'file') return part.sourceText.value;
      if (part.type === 'skill_reference') return createSkillReferenceToken(part.name);
      return '';
    })
    .join('');
}

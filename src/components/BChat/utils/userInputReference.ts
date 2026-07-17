/**
 * @file userInputReference.ts
 * @description 统一扫描并分段 BChat 用户输入中的文件与技能引用 Token。
 */
import { findFileReferenceTokens, type FileReferenceTokenMatch } from '@/utils/file/reference';
import { findSkillReferenceTokens, type SkillReferenceTokenMatch } from './skillReference';

/** 用户输入中的文件引用 Token。 */
export interface UserInputFileReferenceToken {
  /** 引用类型。 */
  type: 'file';
  /** Token 起始 offset。 */
  start: number;
  /** Token 结束 offset。 */
  end: number;
  /** 原始 Token。 */
  token: string;
  /** 文件引用解析结果。 */
  match: FileReferenceTokenMatch;
}

/** 用户输入中的 SkillReference Token。 */
export interface UserInputSkillReferenceToken {
  /** 引用类型。 */
  type: 'skill';
  /** Token 起始 offset。 */
  start: number;
  /** Token 结束 offset。 */
  end: number;
  /** 原始 Token。 */
  token: string;
  /** SkillReference 解析结果。 */
  match: SkillReferenceTokenMatch;
}

/** 用户输入中支持的结构化引用 Token。 */
export type UserInputReferenceToken = UserInputFileReferenceToken | UserInputSkillReferenceToken;

/** 用户输入中的纯文本片段。 */
export interface UserInputTextSegment {
  /** 片段类型。 */
  type: 'text';
  /** 原始文本。 */
  text: string;
}

/** 用户输入中的文件引用片段。 */
export interface UserInputFileSegment {
  /** 片段类型。 */
  type: 'file';
  /** 文件引用 Token。 */
  token: UserInputFileReferenceToken;
}

/** 用户输入中的 SkillReference 片段。 */
export interface UserInputSkillSegment {
  /** 片段类型。 */
  type: 'skill';
  /** SkillReference Token。 */
  token: UserInputSkillReferenceToken;
}

/** 用户输入中的文本或结构化引用片段。 */
export type UserInputReferenceSegment = UserInputTextSegment | UserInputFileSegment | UserInputSkillSegment;

/**
 * 收集文件与 SkillReference Token，并按正文位置排序。
 * @param text - 用户输入原始文本
 * @returns 有序引用 Token
 */
export function collectReferenceTokens(text: string): UserInputReferenceToken[] {
  const fileTokens = findFileReferenceTokens(text).map(
    (match: FileReferenceTokenMatch): UserInputFileReferenceToken => ({
      type: 'file',
      start: match.start,
      end: match.end,
      token: match.token,
      match
    })
  );
  const skillTokens = findSkillReferenceTokens(text).map(
    (match: SkillReferenceTokenMatch): UserInputSkillReferenceToken => ({
      type: 'skill',
      start: match.start,
      end: match.end,
      token: match.token,
      match
    })
  );

  return [...fileTokens, ...skillTokens].sort((left: UserInputReferenceToken, right: UserInputReferenceToken): number => left.start - right.start);
}

/**
 * 将用户输入拆成纯文本与结构化引用的交替片段。
 * @param text - 用户输入原始文本
 * @returns 按正文顺序排列的片段
 */
export function splitReferenceText(text: string): UserInputReferenceSegment[] {
  const segments: UserInputReferenceSegment[] = [];
  let cursor = 0;

  for (const token of collectReferenceTokens(text)) {
    if (token.start < cursor) continue;
    if (token.start > cursor) segments.push({ type: 'text', text: text.slice(cursor, token.start) });

    if (token.type === 'file') segments.push({ type: 'file', token });
    else segments.push({ type: 'skill', token });
    cursor = token.end;
  }

  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) });
  return segments;
}

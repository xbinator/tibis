/**
 * @file parser.ts
 * @description SKILL.md 解析器，提取 frontmatter 元数据和 body 内容。
 */
import yaml from 'js-yaml';
import { DEFAULT_SKILL_MAX_CONTENT_LENGTH, type SkillDefinition, type SkillSource } from './types';

/** 解析选项。 */
interface ParseOptions {
  /** skill 来源，默认 'global' */
  source?: SkillSource;
  /** 内容最大字符数，默认 10000 */
  maxContentLength?: number;
}

/**
 * 从 Markdown 文本中提取 YAML frontmatter。
 * @param markdown - 完整 Markdown 文本
 * @returns frontmatter 文本和 body 文本，无 frontmatter 时返回 null
 */
function extractFrontmatter(markdown: string): { frontmatter: string; body: string } | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return null;
  }
  return { frontmatter: match[1], body: match[2] };
}

/**
 * 使用 js-yaml 解析 frontmatter 文本。
 * @param frontmatter - frontmatter 文本
 * @returns 解析结果，含可能的错误信息
 */
function parseFrontmatter(frontmatter: string): { data: Record<string, unknown>; error?: string } {
  if (!frontmatter.trim()) return { data: {} };

  try {
    const result = yaml.load(frontmatter);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return { data: result as Record<string, unknown> };
    }
    return { data: {} };
  } catch (e: unknown) {
    return { data: {}, error: `Invalid YAML frontmatter: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * 截断超长内容并附加提示。
 * @param content - 原始内容
 * @param maxLength - 最大字符数
 * @param filePath - 文件路径，用于截断提示
 * @returns 处理后的内容
 */
function truncateContent(content: string, maxLength: number, filePath: string): { text: string; truncated: boolean } {
  if (content.length <= maxLength) {
    return { text: content, truncated: false };
  }
  const truncationNotice = `\n[Content truncated at ${maxLength} chars, full content at: ${filePath}]`;
  return { text: content.slice(0, maxLength - truncationNotice.length) + truncationNotice, truncated: true };
}

/**
 * 拼接路径片段，统一使用 / 分隔。
 */
export function joinPath(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/\\/g, '/').replace(/\/+$/, ''))
    .join('/')
    .replace(/\/+/g, '/');
}

/**
 * 获取文件所在目录，兼容 POSIX 与 Windows 路径。
 * @param filePath - 文件路径
 * @returns 文件所在目录（统一使用 / 分隔）
 */
function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) {
    return index === 0 ? '/' : '.';
  }
  return normalized.slice(0, index);
}

/**
 * 解析 SKILL.md 文件内容为 SkillDefinition。
 * @param markdown - SKILL.md 文件内容
 * @param filePath - SKILL.md 文件绝对路径
 * @param options - 解析选项
 * @returns 解析结果（含错误信息时 parseError 不为空）
 */
export function parseSkillMarkdown(markdown: string, filePath: string, options: ParseOptions = {}): SkillDefinition {
  const source: SkillSource = options.source ?? 'global';
  const maxContentLength = options.maxContentLength ?? DEFAULT_SKILL_MAX_CONTENT_LENGTH;
  // 统一使用 / 分隔符，避免 Windows 下 Chokidar 报告 \ 路径与 scanner 的 / 路径不一致导致去重失败
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  const dirPath = dirname(normalizedFilePath);
  const parsedAt = Date.now();

  const extracted = extractFrontmatter(markdown);
  if (!extracted) {
    return {
      name: '',
      description: '',
      content: '',
      filePath: normalizedFilePath,
      dirPath,
      source,
      enabled: true,
      parsedAt,
      parseError: 'Missing YAML frontmatter. SKILL.md must start with --- delimited frontmatter containing name and description.'
    };
  }

  const { data: fm, error: fmError } = parseFrontmatter(extracted.frontmatter);

  if (fmError) {
    return {
      name: '',
      description: '',
      content: '',
      filePath: normalizedFilePath,
      dirPath,
      source,
      enabled: true,
      parsedAt,
      parseError: fmError
    };
  }

  const name = fm.name != null ? String(fm.name).trim() : '';
  const description = fm.description != null ? String(fm.description).trim() : '';

  if (!name) {
    return {
      name: '',
      description,
      content: '',
      filePath: normalizedFilePath,
      dirPath,
      source,
      enabled: true,
      parsedAt,
      parseError: 'Missing required frontmatter field: name'
    };
  }

  if (!description) {
    return {
      name,
      description: '',
      content: '',
      filePath: normalizedFilePath,
      dirPath,
      source,
      enabled: true,
      parsedAt,
      parseError: 'Missing required frontmatter field: description'
    };
  }

  const rawContent = extracted.body.trim();
  const { text: content, truncated } = truncateContent(rawContent, maxContentLength, normalizedFilePath);

  return {
    name,
    description,
    content,
    filePath: normalizedFilePath,
    dirPath,
    source,
    enabled: true,
    parsedAt,
    truncated
  };
}

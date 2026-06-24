/**
 * @file useFrontMatter.ts
 * @description BEditor Front Matter 解析、序列化与内容拼接状态管理。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import yaml from 'js-yaml';

/**
 * Front Matter 数据对象。
 */
export interface FrontMatterData {
  /** Front Matter 字段值 */
  [key: string]: unknown;
}

/**
 * Front Matter YAML 解析结果。
 */
export interface FrontMatterParseResult {
  /** 结构化 Front Matter 数据 */
  data: FrontMatterData;
  /** YAML 原文 */
  raw: string;
  /** 是否无法安全转换为结构化对象 */
  parseError: boolean;
}

/**
 * Front Matter Hook 返回值。
 */
interface UseFrontMatterResult {
  /** 去掉 Front Matter 后的正文内容 */
  bodyContent: Ref<string>;
  /** 当前 Front Matter 数据 */
  frontMatterData: Ref<FrontMatterData>;
  /** 当前 Front Matter YAML 原文 */
  frontMatterRaw: Ref<string>;
  /** 当前内容是否包含 Front Matter */
  hasFrontMatter: ComputedRef<boolean>;
  /** 替换完整 Front Matter 数据 */
  updateFrontMatter: (data: FrontMatterData) => void;
  /** 更新 Front Matter 单个字段 */
  updateFrontMatterField: (key: string, value: unknown) => void;
  /** 删除 Front Matter 单个字段 */
  removeFrontMatterField: (key: string) => void;
  /** 新增 Front Matter 单个字段 */
  addFrontMatterField: (key: string, value: unknown) => void;
  /** 重建完整 Markdown 内容 */
  reconstructContent: () => string;
  /** 设置正文内容 */
  setBodyContent: (content: string) => void;
}

const FRONT_MATTER_REGEX = /^---[ \t]*\r?\n(?:---[ \t]*(?:\r?\n|$)|([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$))/;

/**
 * 判断值是否为 Front Matter 数据对象。
 * @param value - 待判断的值
 * @returns 是普通对象时返回 true
 */
function isFrontMatterData(value: unknown): value is FrontMatterData {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * 解析 Front Matter YAML 字符串并保留错误状态。
 * @param raw - YAML 原文
 * @returns 解析结果，解析失败或非对象时保留 raw 并标记 parseError
 */
export function parseFrontMatterYaml(raw: string): FrontMatterParseResult {
  if (!raw.trim()) {
    return { data: {}, raw, parseError: false };
  }

  try {
    const result = yaml.load(raw);
    if (isFrontMatterData(result)) {
      return { data: result, raw, parseError: false };
    }

    return { data: {}, raw, parseError: true };
  } catch {
    return { data: {}, raw, parseError: true };
  }
}

/**
 * 解析 Front Matter YAML 字符串。
 * @param raw - YAML 原文
 * @returns 解析后的 Front Matter 数据，解析失败或非对象时返回空对象
 */
export function parseFrontMatterData(raw: string): FrontMatterData {
  return parseFrontMatterYaml(raw).data;
}

/**
 * 序列化 Front Matter 数据为 YAML 字符串。
 * @param data - Front Matter 数据
 * @returns Front Matter YAML 字符串
 */
export function serializeFrontMatterYaml(data: FrontMatterData): string {
  if (Object.keys(data).length === 0) {
    return '';
  }

  return yaml.dump(data, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false
  });
}

/**
 * 序列化 Front Matter 数据为 Markdown 块。
 * @param data - Front Matter 数据
 * @returns Front Matter Markdown 块
 */
export function serializeFrontMatterData(data: FrontMatterData): string {
  const yamlStr = serializeFrontMatterYaml(data);
  if (!yamlStr) {
    return '---\n\n---';
  }

  return `---\n${yamlStr}---`;
}

/**
 * 从文件名解析默认 Front Matter 标题。
 * @param fileName - 当前文件名
 * @returns 默认标题
 */
function resolveDefaultFrontMatterTitle(fileName: string | null | undefined): string {
  const trimmedName = fileName?.trim() ?? '';
  if (!trimmedName) {
    return 'Untitled';
  }

  const extensionStart = trimmedName.lastIndexOf('.');
  if (extensionStart > 0) {
    return trimmedName.slice(0, extensionStart);
  }

  return trimmedName;
}

/**
 * 创建默认 Front Matter 数据。
 * @param fileName - 当前文件名
 * @returns 默认 Front Matter 数据
 */
export function createDefaultFrontMatterData(fileName: string | null | undefined): FrontMatterData {
  return {
    title: resolveDefaultFrontMatterTitle(fileName)
  };
}

/**
 * 管理 Markdown Front Matter 与正文的双向拆分。
 * @param content - 外部 Markdown 内容
 * @returns Front Matter 状态与更新方法
 */
export function useFrontMatter(content: Ref<string | undefined>): UseFrontMatterResult {
  const frontMatterRaw = ref<string>('');
  const frontMatterData = ref<FrontMatterData>({});
  const bodyContent = ref<string>('');
  const frontMatterExists = ref(false);
  const hasFrontMatterParseError = ref(false);
  let isInternalUpdate = false;

  const hasFrontMatter = computed(() => frontMatterExists.value);

  /**
   * 从完整 Markdown 中拆分 Front Matter 与正文。
   * @param rawContent - 完整 Markdown 内容
   * @returns 拆分后的 Front Matter 状态
   */
  function parseContent(rawContent: string): { exists: boolean; frontMatter: string; body: string } {
    const match = rawContent.match(FRONT_MATTER_REGEX);

    if (match) {
      return { exists: true, frontMatter: match[1] ?? '', body: rawContent.slice(match[0].length) };
    }

    return { exists: false, frontMatter: '', body: rawContent };
  }

  /**
   * 解析 Hook 内部维护的 Front Matter 原文。
   * @param raw - YAML 原文
   * @returns Front Matter 数据
   */
  function parseFrontMatter(raw: string): FrontMatterData {
    if (!raw.trim()) {
      hasFrontMatterParseError.value = false;
      return {};
    }

    const result = parseFrontMatterYaml(raw);
    hasFrontMatterParseError.value = result.parseError;
    return result.data;
  }

  /**
   * 根据当前状态重建完整 Markdown 内容。
   * @returns 完整 Markdown 内容
   */
  function reconstructContent(): string {
    if (hasFrontMatterParseError.value && frontMatterRaw.value.trim()) {
      return `---\n${frontMatterRaw.value}\n---\n${bodyContent.value}`;
    }

    if (!frontMatterExists.value) {
      return bodyContent.value;
    }

    return `${serializeFrontMatterData(frontMatterData.value)}\n${bodyContent.value}`;
  }

  /**
   * 替换完整 Front Matter 数据。
   * @param data - 新的 Front Matter 数据
   */
  function updateFrontMatter(data: FrontMatterData): void {
    hasFrontMatterParseError.value = false;
    frontMatterExists.value = true;
    frontMatterData.value = { ...data };
  }

  /**
   * 更新 Front Matter 字段。
   * @param key - 字段名
   * @param value - 字段值
   */
  function updateFrontMatterField(key: string, value: unknown): void {
    hasFrontMatterParseError.value = false;
    frontMatterExists.value = true;
    frontMatterData.value = {
      ...frontMatterData.value,
      [key]: value
    };
  }

  /**
   * 删除 Front Matter 字段并保留 Front Matter 块存在状态。
   * @param key - 字段名
   */
  function removeFrontMatterField(key: string): void {
    hasFrontMatterParseError.value = false;
    frontMatterExists.value = true;
    const newData = { ...frontMatterData.value };
    delete newData[key];
    frontMatterData.value = newData;
  }

  /**
   * 新增 Front Matter 字段。
   * @param key - 字段名
   * @param value - 字段值
   */
  function addFrontMatterField(key: string, value: unknown): void {
    if (frontMatterData.value[key] !== undefined) {
      return;
    }
    hasFrontMatterParseError.value = false;
    frontMatterExists.value = true;
    frontMatterData.value = {
      ...frontMatterData.value,
      [key]: value
    };
  }

  /**
   * 设置正文内容并避免下一次 watch 误判为外部更新。
   * @param newContent - 新的正文内容
   */
  function setBodyContent(newContent: string): void {
    isInternalUpdate = true;
    bodyContent.value = newContent;
  }

  watch(
    content,
    (newContent) => {
      if (isInternalUpdate) {
        isInternalUpdate = false;
        return;
      }

      const rawContent = newContent ?? '';
      const { exists, frontMatter, body } = parseContent(rawContent);

      frontMatterExists.value = exists;
      frontMatterRaw.value = frontMatter;
      frontMatterData.value = parseFrontMatter(frontMatter);
      bodyContent.value = body;
    },
    { immediate: true }
  );

  return {
    bodyContent,
    frontMatterData,
    frontMatterRaw,
    hasFrontMatter,
    updateFrontMatter,
    updateFrontMatterField,
    removeFrontMatterField,
    addFrontMatterField,
    reconstructContent,
    setBodyContent
  };
}

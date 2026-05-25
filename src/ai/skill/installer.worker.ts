/**
 * @file installer.worker.ts
 * @description Web Worker：接收 zip ArrayBuffer，解压并解析 SKILL.md。
 */
/* eslint-disable no-restricted-globals */
import type { SkillDefinition } from './types';
import JSZip from 'jszip';
import { parseSkillMarkdown } from './parser';

/** zip 文件 magic bytes（PK\x03\x04） */
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
/** 最大 zip 条目数。 */
const MAX_ENTRIES = 50;
/** 单个文件最大解压后字节数。 */
const MAX_FILE_BYTES = 1 * 1024 * 1024; // 1 MB
/** SKILL.md 文件名。 */
const SKILL_MD = 'SKILL.md';

/** 附带资源文件。 */
interface ResourceFile {
  /** 相对路径（相对于 skill 目录，如 "templates/component.tsx"） */
  relativePath: string;
  /** 文件内容：文本为 UTF-8 字符串，二进制为 base64 编码 */
  content: string;
  /** 编码方式，'base64' 表示二进制文件 */
  encoding?: 'base64';
}

/** Worker 请求。 */
interface WorkerRequest {
  type: 'parse';
  buffer: ArrayBuffer;
}

/** Worker 成功响应。 */
interface WorkerSuccessResponse {
  type: 'success';
  skill: SkillDefinition;
  /** 原始 SKILL.md 完整内容（含 frontmatter），安装时直接写入保留所有字段 */
  rawSkillMd: string;
  resources: ResourceFile[];
  warnings: string[];
}

/** Worker 错误响应。 */
interface WorkerErrorResponse {
  type: 'error';
  error: string;
}

/**
 * 检查 ArrayBuffer 前 4 字节是否为 zip magic bytes。
 */
function isZipFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const header = new Uint8Array(buffer.slice(0, 4));
  return header.every((byte, i) => byte === ZIP_MAGIC[i]);
}

/**
 * 将 Uint8Array 转换为 base64 字符串。
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  if (event.data.type !== 'parse') return;

  const { buffer } = event.data;

  try {
    // Magic bytes 校验：非 zip 格式拒绝
    if (!isZipFormat(buffer)) {
      self.postMessage({
        type: 'error',
        error: '不支持的文件格式，仅支持 .skill 和 .zip（ZIP 格式）'
      } satisfies WorkerErrorResponse);
      return;
    }

    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files).filter((f) => !f.dir);

    // 校验条目数
    if (entries.length > MAX_ENTRIES) {
      self.postMessage({
        type: 'error',
        error: `压缩包包含 ${entries.length} 个文件，超过上限 ${MAX_ENTRIES} 个`
      } satisfies WorkerErrorResponse);
      return;
    }

    // 查找根层级 SKILL.md
    const skillMdEntry = entries.find((e) => {
      const normalized = e.name.replace(/\\/g, '/');
      return normalized === SKILL_MD;
    });

    if (!skillMdEntry) {
      self.postMessage({
        type: 'error',
        error: '压缩包中未找到 SKILL.md 文件（SKILL.md 必须在 zip 根层级）'
      } satisfies WorkerErrorResponse);
      return;
    }

    // Zip Slip 安全校验：所有条目不得包含路径穿越
    for (const entry of entries) {
      const normalized = entry.name.replace(/\\/g, '/');
      if (normalized.includes('../') || normalized.includes('..\\')) {
        self.postMessage({
          type: 'error',
          error: `安全校验失败：条目 "${entry.name}" 包含非法的路径穿越`
        } satisfies WorkerErrorResponse);
        return;
      }
    }

    // 读取 SKILL.md 并解析，从 frontmatter name 获取 skill 目录名
    const rawSkillMd = await skillMdEntry.async('string');
    const skill = parseSkillMarkdown(rawSkillMd, 'SKILL.md', {
      source: 'global'
    });

    if (skill.parseError || !skill.name) {
      self.postMessage({
        type: 'error',
        error: `SKILL.md 解析失败：${skill.parseError || '缺少必填字段 name'}`
      } satisfies WorkerErrorResponse);
      return;
    }

    const warnings: string[] = [];
    const resources: ResourceFile[] = [];

    // 收集附带资源文件
    const otherEntries = entries.filter((e) => e !== skillMdEntry);

    /* eslint-disable no-await-in-loop */
    for (const entry of otherEntries) {
      const data = await entry.async('uint8array');

      if (data.byteLength > MAX_FILE_BYTES) {
        self.postMessage({
          type: 'error',
          error: `文件 "${entry.name}" 解压后超过 1MB 限制`
        } satisfies WorkerErrorResponse);
        return;
      }

      let content: string;
      let encoding: 'base64' | undefined;
      try {
        content = await entry.async('string');
      } catch {
        // 文本解码失败，尝试作为二进制读取并用 base64 编码
        try {
          content = uint8ArrayToBase64(data);
          encoding = 'base64';
          warnings.push(`文件 "${entry.name}" 为二进制文件，已 base64 编码存储`);
        } catch {
          warnings.push(`文件 "${entry.name}" 无法读取，已跳过`);
          continue;
        }
      }

      const relativePath = entry.name.replace(/\\/g, '/');

      resources.push({ relativePath, content, encoding });
    }
    /* eslint-enable no-await-in-loop */

    self.postMessage({
      type: 'success',
      skill,
      rawSkillMd,
      resources,
      warnings
    } satisfies WorkerSuccessResponse);
  } catch (err: unknown) {
    self.postMessage({
      type: 'error',
      error: `解压失败：${err instanceof Error ? err.message : String(err)}`
    } satisfies WorkerErrorResponse);
  }
};

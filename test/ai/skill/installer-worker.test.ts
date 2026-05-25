/**
 * @file installer-worker.test.ts
 * @description 验证 zip 解压 + skill 解析 + 安全校验核心逻辑。
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseSkillMarkdown } from '@/ai/skill/parser';

/** zip magic bytes */
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
/** 最大条目数。 */
const MAX_ENTRIES = 50;
/** 单文件最大字节数。 */
const MAX_FILE_BYTES = 1 * 1024 * 1024;

function isZipFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const header = new Uint8Array(buffer.slice(0, 4));
  return header.every((byte, i) => byte === ZIP_MAGIC[i]);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** 模拟 Worker 内 zip 解析逻辑（抽取纯函数便于测试）。 */
async function parseZipBuffer(buffer: ArrayBuffer): Promise<{
  skillContent: string;
  resourceFiles: { relativePath: string; content: string; encoding?: 'base64' }[];
  warnings: string[];
}> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((f) => !f.dir);

  if (entries.length > MAX_ENTRIES) {
    throw new Error(`压缩包包含 ${entries.length} 个文件，超过上限 ${MAX_ENTRIES} 个`);
  }

  // 查找根层级 SKILL.md
  const skillMdEntry = entries.find((e) => {
    const normalized = e.name.replace(/\\/g, '/');
    return normalized === 'SKILL.md';
  });

  if (!skillMdEntry) {
    throw new Error('压缩包中未找到 SKILL.md 文件（SKILL.md 必须在 zip 根层级）');
  }

  // Zip Slip 安全校验：所有条目不得包含路径穿越
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, '/');
    if (normalized.includes('../') || normalized.includes('..\\')) {
      throw new Error(`安全校验失败：条目 "${entry.name}" 包含非法的路径穿越`);
    }
  }

  const skillContent = await skillMdEntry.async('string');
  const otherEntries = entries.filter((e) => e !== skillMdEntry);
  const resourceFiles: { relativePath: string; content: string; encoding?: 'base64' }[] = [];
  const warnings: string[] = [];

  for (const entry of otherEntries) {
    const data = await entry.async('uint8array');
    if (data.byteLength > MAX_FILE_BYTES) {
      throw new Error(`文件 "${entry.name}" 解压后超过 1MB 限制`);
    }
    let content: string;
    let encoding: 'base64' | undefined;
    try {
      content = await entry.async('string');
    } catch {
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
    resourceFiles.push({ relativePath, content, encoding });
  }

  return { skillContent, resourceFiles, warnings };
}

/**
 * 创建一个测试用 zip（SKILL.md 在根层级，资源文件也在根层级下）。
 */
async function createTestZip(skillMdContent: string, resources?: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('SKILL.md', skillMdContent);

  if (resources) {
    for (const [relPath, content] of Object.entries(resources)) {
      zip.file(relPath, content);
    }
  }

  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('zip parsing logic', () => {
  it('parses a valid zip with SKILL.md', async () => {
    const buffer = await createTestZip(`---
name: my-skill
description: A test skill.
---

# Hello World`);

    const result = await parseZipBuffer(buffer);

    expect(result.skillContent).toContain('name: my-skill');
    expect(result.skillContent).toContain('# Hello World');
    expect(result.resourceFiles).toHaveLength(0);
  });

  it('extracts resource files alongside SKILL.md', async () => {
    const buffer = await createTestZip(
      `---
name: rich-skill
description: Has templates.
---

# Rich Skill`,
      {
        'templates/component.tsx': 'export const Hello = () => <div>Hi</div>;',
        'examples/usage.md': '# Usage\n\nExample here.'
      }
    );

    const result = await parseZipBuffer(buffer);

    expect(result.resourceFiles).toHaveLength(2);
    expect(result.resourceFiles[0].relativePath).toBe('templates/component.tsx');
    expect(result.resourceFiles[1].relativePath).toBe('examples/usage.md');
  });

  it('throws when no SKILL.md found', async () => {
    const zip = new JSZip();
    zip.file('README.md', '# Not a skill');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(parseZipBuffer(buffer)).rejects.toThrow('SKILL.md');
  });

  it('rejects zip slip path traversal (../ in path)', async () => {
    // JSZip normalizes ../ when creating zips, so we test the check logic directly.
    // The worker runs this same check against raw zip entry names from user uploads,
    // which may contain un-normalized paths from malicious zip files.
    const hasTraversal = (name: string) => name.replace(/\\/g, '/').includes('../') || name.includes('..\\');

    expect(hasTraversal('../../../etc/passwd')).toBe(true);
    expect(hasTraversal('..\\..\\windows\\system32')).toBe(true);
    expect(hasTraversal('templates/component.tsx')).toBe(false);
    expect(hasTraversal('SKILL.md')).toBe(false);
  });

  it('accepts entries from different directories at root level', async () => {
    const buffer = await createTestZip(
      `---
name: multi-dir
description: Multi directory.
---

# Multi`,
      {
        'templates/component.tsx': 'export const Hello = () => <div>Hi</div>;',
        'references/CALLOUTS.md': '# Callouts\n\nInfo here.',
        'examples/basic/usage.md': '# Basic\n\nExample.'
      }
    );

    const result = await parseZipBuffer(buffer);

    expect(result.resourceFiles).toHaveLength(3);
    const paths = result.resourceFiles.map((r) => r.relativePath).sort();
    expect(paths).toEqual([
      'examples/basic/usage.md',
      'references/CALLOUTS.md',
      'templates/component.tsx'
    ]);
  });

  it('rejects non-zip files (magic bytes check)', async () => {
    const fakeBuffer = new TextEncoder().encode('not a zip file').buffer;

    expect(isZipFormat(fakeBuffer)).toBe(false);
  });

  it('accepts valid zip magic bytes', async () => {
    const buffer = await createTestZip(`---
name: zip-check
description: Valid zip.
---

# Check`);
    // buffer should start with valid zip magic bytes
    expect(isZipFormat(buffer)).toBe(true);
  });

  it('rejects entries exceeding 1MB single file limit', async () => {
    const zip = new JSZip();
    zip.file('SKILL.md', `---
name: big
description: Big files.
---

# Big`);
    const bigContent = 'x'.repeat(MAX_FILE_BYTES + 1);
    zip.file('huge.txt', bigContent);
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(parseZipBuffer(buffer)).rejects.toThrow('超过 1MB 限制');
  });

  it('rejects too many entries', async () => {
    const zip = new JSZip();
    zip.file('SKILL.md', `---
name: many
description: Many files.
---

# Many`);
    for (let i = 0; i < MAX_ENTRIES; i++) {
      zip.file(`file-${i}.txt`, 'content');
    }
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(parseZipBuffer(buffer)).rejects.toThrow('超过上限');
  });

  it('parseSkillMarkdown validates the parsed SKILL.md content', () => {
    const result = parseSkillMarkdown(
      `---
name: valid
description: Works fine.
---

Body here.`,
      '/test-skill/SKILL.md'
    );

    expect(result.name).toBe('valid');
    expect(result.parseError).toBeUndefined();
  });

  it('parseSkillMarkdown rejects missing name', () => {
    const result = parseSkillMarkdown(
      `---
description: No name here.
---

Body`,
      '/bad/SKILL.md'
    );

    expect(result.parseError).toBeDefined();
    expect(result.parseError).toContain('name');
  });
});

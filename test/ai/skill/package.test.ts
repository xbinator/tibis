/**
 * @file package.test.ts
 * @description Skill zip 包解析测试。
 */
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseSkillPackageBuffer } from '@/ai/skill/package';

/**
 * 创建 Skill zip 测试数据。
 * @returns zip 二进制内容
 */
async function createSkillZipBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('SKILL.md', ['---', 'name: demo-skill', 'description: Demo skill', '---', '', 'Use bundled resources.'].join('\n'));
  zip.file('assets/icon.bin', new Uint8Array([5, 6, 7]));

  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('parseSkillPackageBuffer', (): void => {
  it('parses SKILL.md and keeps bundled resources as binary content', async (): Promise<void> => {
    const buffer = await createSkillZipBuffer();

    const result = await parseSkillPackageBuffer(buffer);

    expect(result.skill.name).toBe('demo-skill');
    expect(result.rawSkillMd).toContain('Use bundled resources.');
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]?.relativePath).toBe('assets/icon.bin');
    expect(Array.from(new Uint8Array(result.resources[0]?.content ?? new ArrayBuffer(0)))).toEqual([5, 6, 7]);
  });
});

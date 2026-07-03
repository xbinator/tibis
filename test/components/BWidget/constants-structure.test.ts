/**
 * @file constants-structure.test.ts
 * @description 验证 BWidget 常量目录按业务域组织。
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 读取 BWidget constants 目录中的 TypeScript 文件名。
 * @returns 常量文件名列表
 */
function readConstantFileNames(): string[] {
  return readdirSync(resolve(__dirname, '../../../src/components/BWidget/constants'))
    .filter((fileName: string): boolean => fileName.endsWith('.ts'))
    .sort();
}

describe('BWidget constants structure', (): void => {
  it('groups constants by business domain instead of a generic defaults file', (): void => {
    expect(readConstantFileNames()).toEqual(['board.ts', 'interaction.ts', 'minimap.ts', 'style.ts', 'text.ts', 'viewport.ts']);
  });
});
